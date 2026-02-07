
export enum TokenType {
  IDENTIFICATION, DIVISION, PROGRAM_ID,
  ENVIRONMENT, CONFIGURATION, INPUT_OUTPUT, FILE_CONTROL, SELECT, ASSIGN, ORGANIZATION,
  LINE, SEQUENTIAL, INDEXED, ACCESS, MODE, DYNAMIC, RANDOM, RECORD, KEY, STATUS,
  DATA, FILE, FD, WORKING_STORAGE, LINKAGE, SECTION, PROCEDURE,
  PIC, VALUE,
  MOVE, ADD, SUBTRACT, MULTIPLY, DIVIDE, 
  TO, FROM, BY, INTO, GIVING, COMPUTE,
  IF, THEN, ELSE, END_IF,
  PERFORM, UNTIL, TIMES, END_PERFORM,
  ACCEPT, DISPLAY, STOP, RUN, CALL, USING, EXIT, PROGRAM, GOBACK,
  OPEN, CLOSE, READ, WRITE, REWRITE, DELETE, START, 
  INPUT, OUTPUT, I_O, EXTEND, AT, END, INVALID, NOT,
  IS,
  // CICS & BMS
  EXEC, CICS, END_EXEC,
  SEND, RECEIVE, MAP, MAPSET,
  TRANSID, COMMAREA, LENGTH, RIDFLD,
  HANDLE, CONDITION,
  LINK, RETURN_CICS, // RETURN is keyword, using RETURN_CICS for internal differentiation if needed, but parser uses context
  MAP_SECTION, DFHMDF, POS, NAME, // BMS keywords
  
  IDENTIFIER, LITERAL_STRING, LITERAL_NUMBER,
  DOT, EQUALS, GREATER, LESS,
  PLUS, MINUS, ASTERISK, SLASH, POWER,
  LPAREN, RPAREN, COLON, // Added Colon for slicing
  ZERO, SPACE,
  EOF
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export interface Diagnostic {
  line: number;
  column: number;
  code: string;
  message: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  source?: string;
}

// --- Structural AST Nodes ---
export interface ASTNode {
  type: string;
  startLine: number;
  endLine: number;
  children: ASTNode[];
}

// --- Execution AST Nodes ---
export interface ProgramNode {
  type: 'Program';
  id: string;
  environmentDivision?: EnvironmentDivisionNode;
  dataDivision: DataDivisionNode;
  procedureDivision: ProcedureDivisionNode;
  debugAST?: ASTNode;
}

export interface EnvironmentDivisionNode {
  fileControl?: FileControlEntry[];
}

export interface FileControlEntry {
  fileName: string;
  externalName: string;
  organization: 'SEQUENTIAL' | 'INDEXED';
  accessMode: 'SEQUENTIAL' | 'RANDOM' | 'DYNAMIC';
  recordKey?: string;
  fileStatus?: string;
}

export interface BMSMapDefinition {
  mapsetName: string;
  mapName: string;
  fields: BMSField[];
}

export interface BMSField {
  name: string;
  row: number;
  col: number;
  length: number;
  initial?: string;
}

export interface DataDivisionNode {
  fileSection?: FileDescriptorNode[];
  workingStorage: VariableDeclarationNode[];
  linkageSection: VariableDeclarationNode[];
  mapSection?: BMSMapDefinition[]; // New Section for Maps
}

export interface FileDescriptorNode {
  fileName: string;
  recordName: string;
  recordLength: number;
}

export interface VariableDeclarationNode {
  level: number;
  name: string;
  picType: 'X' | '9';
  picLength: number;
  defaultValue?: string | number;
}

export interface ProcedureDivisionNode {
  usingParameters: string[];
  statements: StatementNode[];
}

export type StatementNode = 
  | MoveStatement | MathStatement | ComputeStatement
  | IfStatement | PerformStatement | DisplayStatement | AcceptStatement
  | StopRunStatement | CallStatement | ExitProgramStatement | GobackStatement
  | OpenStatement | CloseStatement | ReadStatement | WriteStatement
  | ExecCicsStatement;

// ... (Existing Statements) ...
export interface MoveStatement { type: 'MOVE'; source: string | number; target: string; targetSlice?: {start: number, len: number}; line?: number; }
export interface MathStatement { type: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE'; value: string | number; target: string; line?: number; }
export interface ComputeStatement { type: 'COMPUTE'; target: string; expression: ExpressionNode; line?: number; }
export interface IfStatement { type: 'IF'; condition: ConditionNode; thenBody: StatementNode[]; elseBody?: StatementNode[]; line?: number; }
export interface PerformStatement { type: 'PERFORM'; body: StatementNode[]; until?: ConditionNode; times?: number | string; line?: number; }
export interface DisplayStatement { type: 'DISPLAY'; values: (string | number)[]; line?: number; }
export interface AcceptStatement { type: 'ACCEPT'; target: string; line?: number; }
export interface StopRunStatement { type: 'STOP_RUN'; line?: number; }
export interface CallStatement { type: 'CALL'; programName: string | number; using: string[]; line?: number; }
export interface ExitProgramStatement { type: 'EXIT_PROGRAM'; line?: number; }
export interface GobackStatement { type: 'GOBACK'; line?: number; }

export interface OpenStatement { type: 'OPEN'; mode: 'INPUT' | 'OUTPUT' | 'I-O' | 'EXTEND'; fileName: string; line?: number; }
export interface CloseStatement { type: 'CLOSE'; fileName: string; line?: number; }
export interface ReadStatement { type: 'READ'; fileName: string; next?: boolean; atEnd?: StatementNode[]; notAtEnd?: StatementNode[]; invalidKey?: StatementNode[]; notInvalidKey?: StatementNode[]; line?: number; }
export interface WriteStatement { type: 'WRITE'; recordName: string; invalidKey?: StatementNode[]; notInvalidKey?: StatementNode[]; line?: number; }

// --- CICS Statements ---

export type CicsCommandType = 'SEND_MAP' | 'RECEIVE_MAP' | 'READ' | 'WRITE' | 'REWRITE' | 'DELETE' | 'RETURN' | 'LINK' | 'HANDLE_CONDITION';

export interface ExecCicsStatement {
    type: 'EXEC_CICS';
    command: CicsCommandType;
    params: Record<string, any>;
    line?: number;
}

export type ExpressionNode = 
  | { type: 'Binary'; left: ExpressionNode; operator: TokenType; right: ExpressionNode }
  | { type: 'Unary'; operator: TokenType; right: ExpressionNode }
  | { type: 'Literal'; value: number }
  | { type: 'Variable'; name: string };

export interface ConditionNode {
  left: string | number;
  operator: '=' | '>' | '<';
  right: string | number;
}

// --- Runtime Context ---

export interface VariableContext {
  name: string;
  picType: 'X' | '9';
  length: number;
  rawValue: string | number;
}

export interface StackFrame {
  programId: string;
  memory: Map<string, VariableContext>; 
  linkage: Map<string, VariableContext>;
}

export interface RuntimeResult {
  output: string[];
  errors: string[];
  nextTransaction?: {
      transId: string;
      commarea?: any;
  };
}

// --- Debugger Interface ---

export interface DebugAdapter {
  onStatement(stmt: StatementNode, stack: StackFrame[]): Promise<void>;
}

export type TokenContext = 'DATA_DIVISION' | 'PROCEDURE_DIVISION' | 'IDENTIFICATION_DIVISION' | 'ENVIRONMENT_DIVISION' | 'UNKNOWN';
