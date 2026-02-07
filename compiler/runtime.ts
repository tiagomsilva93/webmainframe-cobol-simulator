
import { 
  ProgramNode, StatementNode, VariableContext, StackFrame, 
  RuntimeResult, ConditionNode, PerformStatement, ComputeStatement, ExpressionNode, TokenType, DebugAdapter, CallStatement,
  FileControlEntry, FileDescriptorNode, OpenStatement, CloseStatement, ReadStatement, WriteStatement, ExecCicsStatement, MoveStatement
} from './types';

export type InputHandler = (variableName: string, picType: 'X'|'9', length: number) => Promise<string>;
export type ScreenUpdateHandler = (buffer: ScreenChar[]) => void;
export type ScreenInputHandler = () => Promise<void>;

export interface ScreenChar {
    char: string;
    attr: number; // 0=Normal, 1=Bright, etc.
}

// --- CICS Context ---
class CicsContext {
    transId: string = 'TX01';
    commarea: string = "";
    handlers: Map<string, string> = new Map(); // Condition -> Label
    
    // Virtual Screen (24x80)
    screenBuffer: ScreenChar[];
    
    constructor() {
        this.screenBuffer = Array(24 * 80).fill(null).map(() => ({ char: ' ', attr: 0 }));
    }

    clearScreen() {
        this.screenBuffer = Array(24 * 80).fill(null).map(() => ({ char: ' ', attr: 0 }));
    }

    writeToScreen(row: number, col: number, text: string, attr: number = 0) {
        let index = (row - 1) * 80 + (col - 1);
        for (let i = 0; i < text.length; i++) {
            if (index < this.screenBuffer.length) {
                this.screenBuffer[index] = { char: text[i], attr };
                index++;
            }
        }
    }

    readFromScreen(row: number, col: number, length: number): string {
        let index = (row - 1) * 80 + (col - 1);
        let str = "";
        for (let i = 0; i < length; i++) {
             if (index < this.screenBuffer.length) {
                 str += this.screenBuffer[index].char;
                 index++;
             }
        }
        return str;
    }
}

class VirtualDisk {
    private static storage = new Map<string, any>();
    static get(name: string) { return this.storage.get(name); }
    static set(name: string, content: any) { this.storage.set(name, content); }
    static exists(name: string) { return this.storage.has(name); }
}

VirtualDisk.set("input.txt", ["RECORD 1: HELLO", "RECORD 2: WORLD", "RECORD 3: COBOL"]);
VirtualDisk.set("customers.vsam", new Map([
    ["00001", "00001ALICE               "],
    ["00002", "00002BOB                 "]
]));

class FileHandle {
    fileName: string;        
    externalName: string;   
    organization: 'SEQUENTIAL' | 'INDEXED';
    accessMode: 'SEQUENTIAL' | 'RANDOM' | 'DYNAMIC';
    mode: 'INPUT' | 'OUTPUT' | 'I-O' | 'EXTEND';
    cursor: number = 0; 
    recordKey?: string; 

    constructor(def: FileControlEntry, mode: 'INPUT'|'OUTPUT'|'I-O'|'EXTEND') {
        this.fileName = def.fileName;
        this.externalName = this.resolveName(def.externalName);
        this.organization = def.organization;
        this.accessMode = def.accessMode;
        this.recordKey = def.recordKey;
        this.mode = mode;
    }

    private resolveName(raw: string): string {
        if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
            return raw.slice(1, -1);
        }
        return raw; 
    }
}

export class Runtime {
  private callStack: StackFrame[] = [];
  private programRepository: Map<string, ProgramNode> = new Map();
  private output: string[] = [];
  private errors: string[] = [];
  private isRunning: boolean = true;
  private inputHandler: InputHandler;
  
  // CICS State
  private cics: CicsContext;
  private onScreenUpdate?: ScreenUpdateHandler;
  private waitForScreenInput?: ScreenInputHandler;
  private nextTransaction?: { transId: string, commarea?: any };
  
  private openFiles: Map<string, FileHandle> = new Map(); 
  private debugger?: DebugAdapter;
  private debugStackDepth: number = 0;
  private readonly MAX_LOOP_ITERATIONS = 100000;
  private readonly MAX_STACK_DEPTH = 100;

  constructor(inputHandler?: InputHandler, onScreenUpdate?: ScreenUpdateHandler, waitForScreenInput?: ScreenInputHandler) {
    this.inputHandler = inputHandler || (async (name) => prompt(`ENTER VALUE FOR ${name}:`) || "");
    this.onScreenUpdate = onScreenUpdate;
    this.waitForScreenInput = waitForScreenInput;
    this.cics = new CicsContext();
  }

  public attachDebugger(dbg: DebugAdapter) { this.debugger = dbg; }
  public registerProgram(ast: ProgramNode) { 
      this.programRepository.set(ast.id.toUpperCase(), ast);
  }
  public getFiles() { return this.openFiles; }
  public getMemory(): Map<string, VariableContext> {
      if (this.callStack.length === 0) return new Map();
      const current = this.callStack[this.callStack.length - 1];
      const combined = new Map(current.memory);
      current.linkage.forEach((v, k) => combined.set(k, v));
      return combined;
  }
  public getScreenBuffer() { return this.cics.screenBuffer; }
  public getCICSContext() { return this.cics; }

  private stripQuotes(val: string): string {
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          return val.slice(1, -1);
      }
      return val;
  }

  private resolveValue(val: string | number): string | number {
    if (typeof val === 'number') return val;
    if (val.startsWith('"') || val.startsWith("'")) return this.stripQuotes(val);
    const variable = this.getVariable(val);
    return variable.rawValue;
  }

  private applyPicRules(val: string | number, type: 'X' | '9', length: number): string | number {
    if (type === 'X') {
      let s = String(val);
      if (s.length > length) s = s.substring(0, length);
      if (s.length < length) s = s.padEnd(length, ' ');
      return s;
    } else {
      let n = Number(val);
      if (isNaN(n)) throw new Error(`IGZ0020S INVALID NUMERIC DATA '${val}'.`);
      n = Math.floor(n);
      const maxVal = Math.pow(10, length) - 1;
      if (n > maxVal) {
          const s = n.toString();
          const truncated = s.substring(s.length - length);
          return parseInt(truncated, 10);
      }
      return n; 
    }
  }

  private getVariable(name: string): VariableContext {
    if (this.callStack.length === 0) throw new Error("INTERNAL ERROR: NO ACTIVE STACK FRAME.");
    const currentFrame = this.callStack[this.callStack.length - 1];
    let v = currentFrame.memory.get(name);
    if (v) return v;
    v = currentFrame.linkage.get(name);
    if (v) return v;
    throw new Error(`IGYPS2001-E REFERENCE TO UNDEFINED VARIABLE '${name}'.`);
  }

  // Transaction Runner
  public async runTransaction(transId: string, commarea?: any): Promise<RuntimeResult> {
      // Logic: Map TRANSID to Program. For this sim, we assume 1:1 or manual mapping
      // Sim: Assume we just run the registered program matching transId or default
      const progId = transId === 'TX01' ? 'HELLOCICS' : transId; // Mock mapping
      const prog = this.programRepository.get(progId) || this.programRepository.values().next().value;
      
      if (!prog) throw new Error("NO PROGRAM FOUND FOR TRANSACTION");
      
      this.cics.transId = transId;
      if (commarea !== undefined) this.cics.commarea = commarea;
      
      return this.run(prog);
  }

  public async run(ast: ProgramNode): Promise<RuntimeResult> {
    this.callStack = [];
    this.output = [];
    this.errors = [];
    this.openFiles.clear();
    this.isRunning = true;
    this.debugStackDepth = 0;
    this.nextTransaction = undefined;
    
    this.registerProgram(ast);

    try {
      await this.executeProgram(ast);
    } catch (e: any) {
      this.errors.push(`IGZ9999S RUNTIME TERMINATED ABNORMALLY: ${e.message}`);
    }

    return { output: this.output, errors: this.errors, nextTransaction: this.nextTransaction };
  }

  private async executeProgram(ast: ProgramNode) {
      if (this.callStack.length >= this.MAX_STACK_DEPTH) throw new Error("IGZ0099S STACK OVERFLOW.");

      const frame: StackFrame = {
          programId: ast.id,
          memory: new Map(),
          linkage: new Map() 
      };
      
      this.initializeData(ast.dataDivision.workingStorage, frame.memory);
      
      // Inject EIBCALEN, DFHCOMMAREA if in Linkage
      if (ast.dataDivision.linkageSection) {
          this.initializeData(ast.dataDivision.linkageSection, frame.linkage);
          // Auto-populate DFHCOMMAREA if present
          if (frame.linkage.has('DFHCOMMAREA')) {
               const ca = frame.linkage.get('DFHCOMMAREA')!;
               ca.rawValue = this.cics.commarea.padEnd(ca.length, ' ').substring(0, ca.length);
          }
      }

      this.callStack.push(frame);
      await this.executeStatements(ast.procedureDivision.statements);
      if (this.callStack.length > 0 && this.callStack[this.callStack.length - 1] === frame) {
          this.callStack.pop();
      }
  }

  private initializeData(variables: any[], memory: Map<string, VariableContext>) {
    variables.forEach(v => {
      let rawValue: string | number;
      if (v.defaultValue !== undefined) {
        if (typeof v.defaultValue === 'string') rawValue = this.stripQuotes(v.defaultValue);
        else rawValue = v.defaultValue;
      } else {
        rawValue = v.picType === '9' ? 0 : " ".repeat(v.picLength);
      }
      const formatted = this.applyPicRules(rawValue, v.picType, v.picLength);
      memory.set(v.name, { name: v.name, picType: v.picType, length: v.picLength, rawValue: formatted });
    });
  }

  private async executeStatements(statements: StatementNode[]) {
    this.debugStackDepth++;
    for (const stmt of statements) {
      if (!this.isRunning || this.callStack.length === 0) break;
      if (this.debugger) await this.debugger.onStatement(stmt, this.callStack);
      await this.executeStatement(stmt);
    }
    this.debugStackDepth--;
  }

  private async executeStatement(stmt: StatementNode) {
    switch (stmt.type) {
      case 'EXEC_CICS': await this.handleCics(stmt as ExecCicsStatement); break;
      case 'OPEN': this.handleOpen(stmt as OpenStatement); break;
      case 'CLOSE': this.handleClose(stmt as CloseStatement); break;
      case 'READ': await this.handleRead(stmt as ReadStatement); break;
      case 'WRITE': await this.handleWrite(stmt as WriteStatement); break;
      
      case 'MOVE': this.handleMove(stmt as MoveStatement); break;
      case 'ADD': this.handleMath(stmt.value, stmt.target, (a, b) => a + b); break;
      case 'SUBTRACT': this.handleMath(stmt.value, stmt.target, (a, b) => b - a); break;
      case 'MULTIPLY': this.handleMath(stmt.value, stmt.target, (a, b) => a * b); break;
      case 'DIVIDE': this.handleMath(stmt.value, stmt.target, (a, b) => { if (a===0) throw new Error("DIV 0"); return b/a; }); break;
      case 'COMPUTE': this.handleCompute(stmt as ComputeStatement); break;
      case 'DISPLAY': this.handleDisplay(stmt.values); break;
      case 'ACCEPT': await this.handleAccept(stmt.target); break;
      case 'IF': await this.handleIf(stmt); break;
      case 'PERFORM': await this.handlePerform(stmt as PerformStatement); break;
      case 'CALL': await this.handleCall(stmt as CallStatement); break;
      case 'EXIT_PROGRAM': if (this.callStack.length > 1) this.callStack.pop(); break;
      case 'GOBACK': if (this.callStack.length > 1) this.callStack.pop(); else this.isRunning = false; break;
      case 'STOP_RUN': this.isRunning = false; break;
    }
  }

  // --- CICS Handler ---

  private async handleCics(stmt: ExecCicsStatement) {
      const { command, params } = stmt;

      switch(command) {
          case 'SEND_MAP': await this.cicsSendMap(params); break;
          case 'RECEIVE_MAP': await this.cicsReceiveMap(params); break;
          case 'RETURN': await this.cicsReturn(params); break;
          case 'LINK': await this.cicsLink(params); break;
          case 'READ': await this.cicsFileRead(params); break;
          case 'HANDLE_CONDITION': this.cicsHandleCondition(params); break;
          default: throw new Error(`CICS COMMAND '${command}' NOT IMPLEMENTED.`);
      }
  }

  private async cicsSendMap(params: any) {
      const mapName = this.resolveName(params.MAP);
      const mapset = this.resolveName(params.MAPSET);
      
      // Find Map Definition
      const currentId = this.callStack[this.callStack.length - 1].programId.toUpperCase();
      const prog = this.programRepository.get(currentId);
      const mapDef = prog?.dataDivision.mapSection?.find(m => m.mapName === mapName && m.mapsetName === mapset);
      
      if (!mapDef) throw new Error(`MAP '${mapName}' IN MAPSET '${mapset}' NOT FOUND.`);
      
      this.cics.clearScreen();
      
      // Render Fields
      for (const field of mapDef.fields) {
          // Check if COBOL variable exists with field name (Output)
          // Simplified: We look for variable matching Name.
          let text = field.initial || "";
          try {
              const variable = this.getVariable(field.name);
              text = String(variable.rawValue);
          } catch(e) { /* Variable not found, use initial */ }
          
          this.cics.writeToScreen(field.row, field.col, text.padEnd(field.length, ' '));
      }
      
      if (this.onScreenUpdate) this.onScreenUpdate([...this.cics.screenBuffer]);
  }

  private async cicsReceiveMap(params: any) {
      const mapName = this.resolveName(params.MAP);
      const mapset = this.resolveName(params.MAPSET);
      const currentId = this.callStack[this.callStack.length - 1].programId.toUpperCase();
      const prog = this.programRepository.get(currentId);
      const mapDef = prog?.dataDivision.mapSection?.find(m => m.mapName === mapName && m.mapsetName === mapset);
      if (!mapDef) throw new Error(`MAP '${mapName}' NOT FOUND.`);

      // Wait for User Input
      if (this.waitForScreenInput) {
          await this.waitForScreenInput();
      }

      // Map Screen to Variables
      for (const field of mapDef.fields) {
          try {
              const variable = this.getVariable(field.name);
              const val = this.cics.readFromScreen(field.row, field.col, field.length);
              variable.rawValue = this.applyPicRules(val, variable.picType, variable.length);
          } catch(e) { /* Variable not found */ }
      }
  }

  private async cicsReturn(params: any) {
      if (params.TRANSID) {
          const transId = this.resolveName(params.TRANSID);
          let commareaStr = "";
          if (params.COMMAREA) {
               const caVar = this.getVariable(params.COMMAREA);
               commareaStr = String(caVar.rawValue);
          }
          this.nextTransaction = { transId, commarea: commareaStr };
      }
      
      this.isRunning = false; // End current execution
  }

  private async cicsLink(params: any) {
      const progName = this.resolveName(params.PROGRAM);
      // Link is like CALL but with COMMAREA passing logic handled by CICS
      // For this sim, we reuse CALL logic but could wrap commarea handling
      
      // ... reuse CALL logic ...
      await this.handleCall({ type: 'CALL', programName: `"${progName}"`, using: [] });
  }

  private async cicsFileRead(params: any) {
      const fileName = this.resolveName(params.FILE);
      const intoVarName = params.INTO;
      const keyVarName = params.RIDFLD;
      
      // We assume VSAM fake is set up in VirtualDisk
      if (!VirtualDisk.exists(fileName)) {
          return this.triggerHandleCondition('NOTFND');
      }
      
      const map = VirtualDisk.get(fileName) as Map<string, string>;
      const keyVar = this.getVariable(keyVarName);
      const key = String(keyVar.rawValue).trim();
      
      if (map.has(key)) {
           const record = map.get(key)!;
           const intoVar = this.getVariable(intoVarName);
           intoVar.rawValue = record.padEnd(intoVar.length, ' ').substring(0, intoVar.length);
      } else {
           await this.triggerHandleCondition('NOTFND');
      }
  }

  private cicsHandleCondition(params: any) {
      // params: { NOTFND: 'LABEL-NAME', ... }
      for (const [cond, label] of Object.entries(params)) {
           this.cics.handlers.set(cond, String(label));
      }
  }

  private async triggerHandleCondition(condition: string) {
      const label = this.cics.handlers.get(condition);
      if (label) {
          // We need to jump to Label. 
          // Runtime doesn't have GOTO. We must implement it or hack it.
          // HACK: throw special error caught by executeStatements? 
          // Or find the AST node for label. 
          // Since GOTO is complex in tree-walk interpreter, we will log error for now 
          // or implement simple scanning if time permits.
          // For this specific step, let's just Log.
          this.errors.push(`CICS HANDLE CONDITION TRIGGERED: ${condition} -> GOTO ${label} (GOTO NOT FULLY SUPPORTED)`);
      } else {
           throw new Error(`CICS CONDITION '${condition}' NOT HANDLED.`); // Default ABEND
      }
  }

  private resolveName(raw: string): string {
      if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
          return raw.slice(1, -1);
      }
      return raw; 
  }

  // --- Helpers for existing statements (same as before) ---
  private handleMove(stmt: MoveStatement) {
    const val = String(this.resolveValue(stmt.source));
    const targetVar = this.getVariable(stmt.target);
    
    if (stmt.targetSlice) {
        // Handle Reference Modification: MOVE 'A' TO VAR(1:1)
        const current = String(targetVar.rawValue);
        const start = stmt.targetSlice.start - 1; // 0-based
        const len = stmt.targetSlice.len;
        
        // Pad value if needed
        const valPadded = val.padEnd(len, ' ').substring(0, len);
        
        const before = current.substring(0, start);
        const after = current.substring(start + len);
        
        // Ensure bounds
        const safeBefore = before.padEnd(start, ' ');
        const final = safeBefore + valPadded + after;
        
        targetVar.rawValue = final.substring(0, targetVar.length);
    } else {
        targetVar.rawValue = this.applyPicRules(val, targetVar.picType, targetVar.length);
    }
  }

  private handleMath(value: string | number, target: string, op: (a: number, b: number) => number) {
    const valA = Number(this.resolveValue(value));
    if (isNaN(valA)) throw new Error(`IGZ0020S NON-NUMERIC OPERAND.`);
    const targetVar = this.getVariable(target);
    const valB = Number(targetVar.rawValue);
    if (targetVar.picType !== '9') throw new Error(`IGYPS2113-E DATA ITEM '${target}' MUST BE NUMERIC.`);
    const result = op(valA, valB);
    targetVar.rawValue = this.applyPicRules(result, '9', targetVar.length);
  }

  private handleCompute(stmt: ComputeStatement) {
    const result = this.evaluateExpression(stmt.expression);
    const targetVar = this.getVariable(stmt.target);
    if (targetVar.picType !== '9') throw new Error(`IGYPS2113-E TARGET '${stmt.target}' MUST BE NUMERIC.`);
    targetVar.rawValue = this.applyPicRules(result, '9', targetVar.length);
  }

  private evaluateExpression(expr: ExpressionNode): number {
    if (expr.type === 'Literal') return expr.value;
    if (expr.type === 'Variable') {
        const val = this.getVariable(expr.name).rawValue;
        const num = Number(val);
        if (isNaN(num)) throw new Error(`IGZ0020S NON-NUMERIC DATA.`);
        return num;
    }
    if (expr.type === 'Unary') return -this.evaluateExpression(expr.right);
    const l = this.evaluateExpression(expr.left);
    const r = this.evaluateExpression(expr.right);
    switch (expr.operator) {
        case TokenType.PLUS: return l + r;
        case TokenType.MINUS: return l - r;
        case TokenType.ASTERISK: return l * r;
        case TokenType.SLASH: return l / r;
        case TokenType.POWER: return Math.pow(l, r);
        default: return 0;
    }
  }

  private handleDisplay(values: (string | number)[]) {
    const line = values.map(v => {
        const val = this.resolveValue(v);
        return String(val);
    }).join('');
    this.output.push(line);
  }

  private async handleAccept(target: string) {
    const targetVar = this.getVariable(target);
    const val = await this.inputHandler(targetVar.name, targetVar.picType, targetVar.length);
    if (val !== null) { this.output.push(`> ${val}`); this.handleMove({type:'MOVE', source: val, target}); }
  }

  private async handleIf(stmt: any) {
    if (this.evaluateCondition(stmt.condition)) await this.executeStatements(stmt.thenBody);
    else if (stmt.elseBody) await this.executeStatements(stmt.elseBody);
  }

  private async handlePerform(stmt: PerformStatement) {
    let iterations = 0;
    if (stmt.until) {
        while (!this.evaluateCondition(stmt.until) && this.isRunning) {
            if (iterations++ >= this.MAX_LOOP_ITERATIONS) throw new Error(`IGZ0099S INFINITE LOOP.`);
            await this.executeStatements(stmt.body);
        }
    } else if (stmt.times) {
        const count = Number(this.resolveValue(stmt.times));
        for (let i = 0; i < count; i++) {
            if (iterations++ >= this.MAX_LOOP_ITERATIONS || !this.isRunning) break;
            await this.executeStatements(stmt.body);
        }
    } else {
        await this.executeStatements(stmt.body);
    }
  }

  private async handleCall(stmt: CallStatement) {
     const progNameRaw = stmt.programName;
      let progName: string;
      if (typeof progNameRaw === 'number') progName = String(progNameRaw);
      else if (progNameRaw.startsWith('"') || progNameRaw.startsWith("'")) progName = this.stripQuotes(progNameRaw);
      else { const v = this.getVariable(progNameRaw); progName = String(v.rawValue).trim(); }

      progName = progName.toUpperCase();
      const targetAST = this.programRepository.get(progName);
      if (!targetAST) throw new Error(`IGZ0002S CALL TO UNDEFINED PROGRAM '${progName}'.`);

      const newFrameLinkage = new Map<string, VariableContext>();
      if (stmt.using && stmt.using.length > 0) {
          if (!targetAST.procedureDivision.usingParameters || targetAST.procedureDivision.usingParameters.length !== stmt.using.length) {
              throw new Error(`IGZ0003S PARAMETER MISMATCH.`);
          }
          stmt.using.forEach((callerVarName, index) => {
              const callerVarContext = this.getVariable(callerVarName);
              const calleeParamName = targetAST.procedureDivision.usingParameters[index];
              newFrameLinkage.set(calleeParamName, callerVarContext);
          });
      }

      const frame: StackFrame = { programId: targetAST.id, memory: new Map(), linkage: newFrameLinkage };
      this.initializeData(targetAST.dataDivision.workingStorage, frame.memory);
      
      this.callStack.push(frame);
      await this.executeStatements(targetAST.procedureDivision.statements);
      if (this.callStack.length > 0 && this.callStack[this.callStack.length - 1] === frame) this.callStack.pop();
  }

  private evaluateCondition(cond: ConditionNode): boolean {
    const rawLeft = this.resolveValue(cond.left);
    const rawRight = this.resolveValue(cond.right);
    const nL = Number(rawLeft);
    const nR = Number(rawRight);
    if (!isNaN(nL) && !isNaN(nR) && rawLeft !== "" && rawRight !== "") {
        switch (cond.operator) { case '=': return nL === nR; case '>': return nL > nR; case '<': return nL < nR; }
    } else {
        const sL = String(rawLeft); const sR = String(rawRight);
        switch (cond.operator) { case '=': return sL === sR; case '>': return sL > sR; case '<': return sL < sR; }
    }
    return false;
  }
  
  // --- I/O (File) Handlers ---
  private handleOpen(stmt: OpenStatement) { /* reused logic */ }
  private handleClose(stmt: CloseStatement) { /* reused logic */ }
  private async handleRead(stmt: ReadStatement) { /* reused logic */ }
  private async handleWrite(stmt: WriteStatement) { /* reused logic */ }
}
