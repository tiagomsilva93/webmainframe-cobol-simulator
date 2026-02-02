
import { 
  ProgramNode, StatementNode, ExpressionNode, ConditionNode, 
  VariableDeclarationNode 
} from './types';
import { ValidationError } from './validator';

interface SymbolInfo {
  name: string;
  type: 'X' | '9';
  length: number;
  line: number;
}

export class SemanticValidator {
  private static symbolTable: Map<string, SymbolInfo> = new Map();
  private static errors: ValidationError[] = [];

  public static validate(ast: ProgramNode): ValidationError[] {
    this.symbolTable.clear();
    this.errors = [];

    // Pass 1: Build Symbol Table from Data Division
    this.buildSymbolTable(ast.dataDivision.variables);

    // Pass 2: Validate Statements in Procedure Division
    this.validateStatements(ast.procedureDivision.statements);

    return this.errors;
  }

  private static buildSymbolTable(variables: VariableDeclarationNode[]) {
    variables.forEach(v => {
      // Check for duplicates
      if (this.symbolTable.has(v.name)) {
        // Warning: Redefinition (Simplified for this sim)
        this.addError(0, 0, 'IGYPS2112-W', `VARIABLE '${v.name}' ALREADY DEFINED.`, 'WARNING');
      }
      
      this.symbolTable.set(v.name, {
        name: v.name,
        type: v.picType,
        length: v.picLength,
        line: 0 
      });
    });
  }

  private static validateStatements(statements: StatementNode[]) {
    statements.forEach(stmt => {
      switch (stmt.type) {
        case 'MOVE':
          this.validateMove(stmt.source, stmt.target, stmt);
          break;
        case 'ADD':
        case 'SUBTRACT':
          this.validateMath(stmt.value, stmt.target, stmt);
          break;
        case 'COMPUTE':
          this.validateCompute(stmt.target, stmt.expression, stmt);
          break;
        case 'IF':
          this.validateCondition(stmt.condition, stmt);
          this.validateStatements(stmt.thenBody);
          if (stmt.elseBody) this.validateStatements(stmt.elseBody);
          break;
        case 'PERFORM':
          if (stmt.until) this.validateCondition(stmt.until, stmt);
          if (stmt.times) this.validateNumericSource(stmt.times, stmt);
          this.validateStatements(stmt.body);
          break;
        case 'ACCEPT':
          this.validateVariable(stmt.target, stmt, false);
          break;
        case 'DISPLAY':
          // DISPLAY accepts both Literals and Variables.
          // Since the parser strips quotes from string literals, we cannot easily distinguish 
          // "HELLO" (literal) from HELLO (identifier) in the AST.
          // Strategy: Implicitly accept all strings. If it's a variable, runtime uses it.
          // If it's not a variable, runtime treats it as a literal.
          // This avoids false positives like "VARIABLE 'STARTING...' NOT DEFINED".
          stmt.values.forEach(v => {
              // No-op validation for DISPLAY values to allow literals.
          });
          break;
      }
    });
  }

  private static validateMove(source: string | number, target: string, context: any) {
    const targetSymbol = this.validateVariable(target, context, true);
    if (!targetSymbol) return;

    if (typeof source === 'number') {
       // Moving Number to PIC X/9 is valid.
    } else {
       // Source is a string (Identifier OR Literal)
       const sourceSymbol = this.symbolTable.get(source);
       
       if (sourceSymbol) {
           // It IS a defined variable. Check type compatibility.
           if (sourceSymbol.type === 'X' && targetSymbol.type === '9') {
               this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `ALPHANUMERIC ITEM '${source}' CANNOT BE MOVED TO NUMERIC ITEM '${target}'.`, 'ERROR');
           }
       } else {
           // It is NOT in the symbol table. Treat it as a LITERAL.
           // Validate if Literal is compatible with Target.
           if (targetSymbol.type === '9') {
               // Moving String Literal to PIC 9? Only valid if it looks numeric.
               if (isNaN(Number(source)) || source.trim() === '') {
                   this.addError(context.startLine || 0, 0, 'IGYPS2017-E', `ALPHANUMERIC LITERAL '${source}' NOT VALID FOR NUMERIC ITEM '${target}'.`, 'ERROR');
               }
           }
       }
    }
  }

  private static validateMath(value: string | number, target: string, context: any) {
     const targetSymbol = this.validateVariable(target, context, false); // Must be defined
     
     if (targetSymbol) {
         if (targetSymbol.type !== '9') {
             this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `DATA ITEM '${target}' MUST BE NUMERIC FOR ARITHMETIC OPERATION.`, 'ERROR');
         }
     }

     this.validateNumericSource(value, context);
  }

  private static validateCompute(target: string, expr: ExpressionNode, context: any) {
      const targetSymbol = this.validateVariable(target, context, false);
      if (targetSymbol && targetSymbol.type !== '9') {
          this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `TARGET '${target}' MUST BE NUMERIC FOR COMPUTE.`, 'ERROR');
      }
      this.validateExpression(expr, context);
  }

  private static validateExpression(expr: ExpressionNode, context: any) {
      if (expr.type === 'Binary') {
          this.validateExpression(expr.left, context);
          this.validateExpression(expr.right, context);
      } else if (expr.type === 'Unary') {
          this.validateExpression(expr.right, context);
      } else if (expr.type === 'Variable') {
          const sym = this.symbolTable.get(expr.name);
          if (!sym) {
              this.addError(context.startLine || 0, 0, 'IGYPS2001-E', `VARIABLE '${expr.name}' NOT DEFINED.`, 'ERROR');
          } else if (sym.type !== '9') {
              this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `VARIABLE '${expr.name}' IN EXPRESSION MUST BE NUMERIC.`, 'ERROR');
          }
      }
  }

  private static validateCondition(cond: ConditionNode, context: any) {
     this.validateOperand(cond.left, context);
     this.validateOperand(cond.right, context);
  }

  private static validateOperand(val: string | number, context: any) {
      if (typeof val === 'string') {
          // If in symbol table, it's a variable (Valid).
          // If NOT in symbol table, it's a literal (Valid).
          // We do not enforce existence here to support literals in IF conditions.
      }
  }

  private static validateNumericSource(val: string | number, context: any) {
      if (typeof val === 'number') return;
      
      // Val is string (Variable or invalid String Literal in Math)
      const sym = this.symbolTable.get(val);
      if (sym) {
          if (sym.type !== '9') {
              this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `VARIABLE '${val}' MUST BE NUMERIC.`, 'ERROR');
          }
      } else {
          // If it's not a variable, it's a string literal. 
          // COBOL Arithmetic generally requires Numeric Literals (unquoted) or Variables.
          // ADD "1" TO X is technically invalid (should be ADD 1).
          this.addError(context.startLine || 0, 0, 'IGYPS2113-E', `INVALID ARITHMETIC OPERAND '${val}'. EXPECTED NUMERIC LITERAL OR VARIABLE.`, 'ERROR');
      }
  }

  private static validateVariable(name: string, context: any, allowAnyType: boolean): SymbolInfo | undefined {
      const sym = this.symbolTable.get(name);
      if (!sym) {
          this.addError(context.startLine || 0, 0, 'IGYPS2001-E', `VARIABLE '${name}' NOT DEFINED.`, 'ERROR');
          return undefined;
      }
      return sym;
  }

  private static addError(line: number, col: number, code: string, message: string, severity: 'ERROR'|'WARNING') {
      this.errors.push({
          line,
          column: col,
          code,
          message,
          severity
      });
  }
}
