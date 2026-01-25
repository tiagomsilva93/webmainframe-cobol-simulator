
export enum TokenType {
  IDENTIFICATION, DIVISION, PROGRAM_ID,
  ENVIRONMENT, DATA, WORKING_STORAGE, SECTION, PROCEDURE,
  PIC, VALUE,
  MOVE, ADD, SUBTRACT, TO, FROM, GIVING, COMPUTE,
  IF, THEN, ELSE, END_IF,
  PERFORM, UNTIL, TIMES, END_PERFORM,
  ACCEPT, DISPLAY, STOP, RUN,
  IDENTIFIER, LITERAL_STRING, LITERAL_NUMBER,
  DOT, EQUALS, GREATER, LESS,
  PLUS, MINUS, ASTERISK, SLASH, POWER,
  LPAREN, RPAREN,
  ZERO, SPACE,
  EOF
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

// --- AST Nodes ---

export interface ProgramNode {
  type: 'Program';
  id: string;
  dataDivision: DataDivisionNode;
  procedureDivision: ProcedureDivisionNode;
}

export interface DataDivisionNode {
  variables: VariableDeclarationNode[];
}

export interface VariableDeclarationNode {
  level: number;
  name: string;
  picType: 'X' | '9';
  picLength: number;
  defaultValue?: string | number;
}

export interface ProcedureDivisionNode {
  statements: StatementNode[];
}

export type StatementNode = 
  | MoveStatement
  | MathStatement
  | ComputeStatement
  | IfStatement
  | PerformStatement
  | DisplayStatement
  | AcceptStatement
  | StopRunStatement;

export interface MoveStatement {
  type: 'MOVE';
  source: string | number; // Identifier or Literal
  target: string; // Identifier
}

export interface MathStatement {
  type: 'ADD' | 'SUBTRACT';
  value: string | number;
  target: string;
}

export interface ComputeStatement {
  type: 'COMPUTE';
  target: string;
  expression: ExpressionNode;
}

export type ExpressionNode = 
  | { type: 'Binary'; left: ExpressionNode; operator: TokenType; right: ExpressionNode }
  | { type: 'Unary'; operator: TokenType; right: ExpressionNode }
  | { type: 'Literal'; value: number }
  | { type: 'Variable'; name: string };

export interface IfStatement {
  type: 'IF';
  condition: ConditionNode;
  thenBody: StatementNode[];
  elseBody?: StatementNode[];
}

export interface PerformStatement {
  type: 'PERFORM';
  body: StatementNode[];
  until?: ConditionNode;
  times?: number | string;
}

export interface DisplayStatement {
  type: 'DISPLAY';
  values: (string | number)[];
}

export interface AcceptStatement {
  type: 'ACCEPT';
  target: string;
}

export interface StopRunStatement {
  type: 'STOP_RUN';
}

export interface ConditionNode {
  left: string | number;
  operator: '=' | '>' | '<';
  right: string | number;
}

// --- Runtime ---

export interface VariableContext {
  name: string;
  picType: 'X' | '9';
  length: number;
  rawValue: string | number;
}

export interface RuntimeResult {
  output: string[];
  errors: string[];
}
