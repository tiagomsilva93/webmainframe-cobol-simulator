
import { 
  ProgramNode, StatementNode, VariableContext, 
  RuntimeResult, ConditionNode, PerformStatement, ComputeStatement, ExpressionNode, TokenType
} from './types';

export type InputHandler = (variableName: string, picType: 'X'|'9', length: number) => Promise<string>;

export class Runtime {
  private memory: Map<string, VariableContext> = new Map();
  private output: string[] = [];
  private errors: string[] = [];
  private isRunning: boolean = true;
  private inputHandler: InputHandler;

  constructor(inputHandler?: InputHandler) {
    // If no handler provided, fallback to basic prompt (though UI should provide one)
    this.inputHandler = inputHandler || (async (name) => prompt(`Value for ${name}`) || "");
  }

  public async run(ast: ProgramNode): Promise<RuntimeResult> {
    this.memory.clear();
    this.output = [];
    this.errors = [];
    this.isRunning = true;

    try {
      this.initializeData(ast.dataDivision.variables);
      await this.executeStatements(ast.procedureDivision.statements);
    } catch (e: any) {
      this.errors.push(`RUNTIME ERROR: ${e.message}`);
    }

    return {
      output: this.output,
      errors: this.errors
    };
  }

  private initializeData(variables: any[]) {
    variables.forEach(v => {
      let rawValue: string | number;
      
      if (v.defaultValue !== undefined) {
        rawValue = v.defaultValue;
      } else {
        // Default init
        rawValue = v.picType === '9' ? 0 : " ".repeat(v.picLength);
      }

      const context: VariableContext = {
        name: v.name,
        picType: v.picType,
        length: v.picLength,
        rawValue: this.formatValue(rawValue, v.picType, v.picLength)
      };
      
      this.memory.set(v.name, context);
    });
  }

  private formatValue(val: string | number, type: 'X' | '9', length: number): string | number {
    if (type === 'X') {
      let s = String(val);
      if (s.length > length) s = s.substring(0, length);
      if (s.length < length) s = s.padEnd(length, ' ');
      return s;
    } else {
      // PIC 9
      let n = typeof val === 'string' ? parseFloat(val) : val;
      if (isNaN(n)) n = 0;
      return n; 
    }
  }

  private getVariable(name: string): VariableContext {
    const v = this.memory.get(name);
    if (!v) throw new Error(`Variable '${name}' not defined.`);
    return v;
  }

  private resolveValue(val: string | number): any {
    if (typeof val === 'number') return val;
    // Check if it's a variable
    if (this.memory.has(val)) {
        return this.memory.get(val)?.rawValue;
    }
    // Literal string
    return val;
  }

  private async executeStatements(statements: StatementNode[]) {
    for (const stmt of statements) {
      if (!this.isRunning) break;
      await this.executeStatement(stmt);
    }
  }

  private async executeStatement(stmt: StatementNode) {
    switch (stmt.type) {
      case 'MOVE':
        this.handleMove(stmt.source, stmt.target);
        break;
      case 'ADD':
        this.handleMath(stmt.value, stmt.target, (a, b) => a + b);
        break;
      case 'SUBTRACT':
        this.handleMath(stmt.value, stmt.target, (a, b) => b - a);
        break;
      case 'COMPUTE':
        this.handleCompute(stmt as ComputeStatement);
        break;
      case 'DISPLAY':
        const line = stmt.values.map(v => this.resolveValue(v)).join('');
        this.output.push(line);
        break;
      case 'ACCEPT':
        await this.handleAccept(stmt.target);
        break;
      case 'IF':
        await this.handleIf(stmt);
        break;
      case 'PERFORM':
        await this.handlePerform(stmt as PerformStatement);
        break;
      case 'STOP_RUN':
        this.isRunning = false;
        this.output.push("PROGRAM ENDED normally.");
        break;
    }
  }

  private handleMove(source: string | number, target: string) {
    const val = this.resolveValue(source);
    const targetVar = this.getVariable(target);
    targetVar.rawValue = this.formatValue(val, targetVar.picType, targetVar.length);
  }

  private handleMath(value: string | number, target: string, op: (a: number, b: number) => number) {
    const valA = Number(this.resolveValue(value));
    const targetVar = this.getVariable(target);
    const valB = Number(targetVar.rawValue);
    
    if (targetVar.picType !== '9') {
        throw new Error(`Cannot perform math on PIC X variable '${target}'`);
    }

    const result = op(valA, valB);
    targetVar.rawValue = result;
  }

  private handleCompute(stmt: ComputeStatement) {
    const result = this.evaluateExpression(stmt.expression);
    const targetVar = this.getVariable(stmt.target);
    
    if (targetVar.picType !== '9') {
        throw new Error(`Cannot COMPUTE into PIC X variable '${stmt.target}'`);
    }

    targetVar.rawValue = result;
  }

  private evaluateExpression(expr: ExpressionNode): number {
    switch (expr.type) {
        case 'Literal':
            return expr.value;
        case 'Variable':
            const val = this.memory.get(expr.name)?.rawValue;
            if (val === undefined) throw new Error(`Variable '${expr.name}' not found during evaluation`);
            const num = Number(val);
            if (isNaN(num)) throw new Error(`Variable '${expr.name}' contains non-numeric value: ${val}`);
            return num;
        case 'Unary':
            const right = this.evaluateExpression(expr.right);
            if (expr.operator === TokenType.MINUS) return -right;
            return right; // Should handle PLUS or other unary if added
        case 'Binary':
            const leftVal = this.evaluateExpression(expr.left);
            const rightVal = this.evaluateExpression(expr.right);
            switch (expr.operator) {
                case TokenType.PLUS: return leftVal + rightVal;
                case TokenType.MINUS: return leftVal - rightVal;
                case TokenType.ASTERISK: return leftVal * rightVal;
                case TokenType.SLASH: 
                    if (rightVal === 0) throw new Error("Division by zero");
                    return leftVal / rightVal;
                case TokenType.POWER: return Math.pow(leftVal, rightVal);
                default: throw new Error(`Unknown operator in binary expression`);
            }
        default:
            throw new Error(`Unknown expression type`);
    }
  }

  private async handleAccept(target: string) {
    const targetVar = this.getVariable(target);
    
    // Call the external input handler (Pause execution until promise resolves)
    const val = await this.inputHandler(targetVar.name, targetVar.picType, targetVar.length);
    
    if (val !== null) {
        this.handleMove(val, target);
        // Echo input to output log for realism
        this.output.push(`> ${val}`); 
    }
  }

  private async handleIf(stmt: any) {
    if (this.evaluateCondition(stmt.condition)) {
        await this.executeStatements(stmt.thenBody);
    } else if (stmt.elseBody) {
        await this.executeStatements(stmt.elseBody);
    }
  }

  private async handlePerform(stmt: PerformStatement) {
    const LOOP_LIMIT = 20000;
    let iterations = 0;

    if (stmt.until) {
        while (!this.evaluateCondition(stmt.until) && this.isRunning) {
            if (iterations >= LOOP_LIMIT) {
                this.errors.push(`IGYPS9999-S Infinite loop detected in PERFORM UNTIL (limit ${LOOP_LIMIT}).`);
                this.isRunning = false;
                break;
            }
            await this.executeStatements(stmt.body);
            iterations++;
        }
    } else if (stmt.times) {
        const count = Number(this.resolveValue(stmt.times));
        if (!isNaN(count) && count > 0) {
            for (let i = 0; i < count; i++) {
                if (iterations >= LOOP_LIMIT) {
                    this.errors.push(`IGYPS9999-S Runtime limit exceeded: Loop ran > ${LOOP_LIMIT} times.`);
                    this.isRunning = false;
                    break;
                }
                if (!this.isRunning) break;
                await this.executeStatements(stmt.body);
                iterations++;
            }
        }
    } else {
        await this.executeStatements(stmt.body);
    }
  }

  private evaluateCondition(cond: ConditionNode): boolean {
    const left = this.resolveValue(cond.left);
    const right = this.resolveValue(cond.right);

    const isNum = !isNaN(Number(left)) && !isNaN(Number(right)) && String(left).trim() !== '' && String(right).trim() !== '';
    const lVal = isNum ? Number(left) : left;
    const rVal = isNum ? Number(right) : right;

    switch (cond.operator) {
        case '=': return lVal == rVal;
        case '>': return lVal > rVal;
        case '<': return lVal < rVal;
        default: return false;
    }
  }
}
