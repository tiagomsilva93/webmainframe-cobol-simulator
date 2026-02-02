
export type Severity = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationError {
  line: number;
  column: number;
  code: string;
  message: string;
  severity: Severity; 
}

export class Validator {
  // Verbs that MUST start in Area B
  private static AREA_B_KEYWORDS = new Set([
    'ACCEPT', 'ADD', 'ALTER', 'CALL', 'CANCEL', 'CLOSE', 'COMPUTE', 'CONTINUE', 
    'DELETE', 'DISPLAY', 'DIVIDE', 'EVALUATE', 'EXIT', 'GO', 'GOBACK', 'IF', 'INITIALIZE', 
    'INSPECT', 'MERGE', 'MOVE', 'MULTIPLY', 'OPEN', 'PERFORM', 'READ', 'RELEASE', 
    'RETURN', 'REWRITE', 'SEARCH', 'SET', 'SORT', 'START', 'STOP', 'STRING', 
    'SUBTRACT', 'UNSTRING', 'WRITE', 'ELSE', 'END-IF', 'END-PERFORM', 'THEN'
  ]);

  // Headers that MUST start in Area A
  private static AREA_A_KEYWORDS = new Set([
    'IDENTIFICATION', 'PROGRAM-ID', 'ENVIRONMENT', 'CONFIGURATION', 'INPUT-OUTPUT',
    'DATA', 'FILE', 'WORKING-STORAGE', 'LOCAL-STORAGE', 'LINKAGE', 'PROCEDURE',
    'DIVISION', 'SECTION', 'FD', 'SD', 'RD', 'CD'
  ]);

  /**
   * Helper to determine if a severity level stops compilation.
   */
  public static isFatal(severity: Severity): boolean {
    return severity === 'ERROR';
  }

  public static validate(source: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = source.split('\n');
    
    // Simple state tracking
    let currentDivision: 'ID' | 'ENV' | 'DATA' | 'PROC' | null = null;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const lineNum = i + 1;
      
      // 0. Empty lines logic
      if (rawLine.trim().length === 0) continue;

      // 1. Check Info Area (Cols 73-80)
      // If line is longer than 72 chars, check if there is non-whitespace in 73+
      if (rawLine.length > 72) {
         const overflow = rawLine.substring(72);
         if (overflow.trim().length > 0) {
             errors.push({
                 line: lineNum,
                 column: 73,
                 code: 'IGYPS0073-I', 
                 message: 'TEXT FOUND IN COLUMNS 73-80 (IGNORED)',
                 severity: 'INFO'
             });
         }
      }

      // 2. Check Indicator (Col 7 / Index 6)
      if (rawLine.length >= 7) {
        const indicator = rawLine[6];
        if (indicator === '*' || indicator === '/') continue; // Comment line
        if (indicator === 'D' || indicator === 'd') continue; // Debug line
        if (indicator === '-') {
            // Continuation - we don't support full logic yet but it's valid syntax
            continue; 
        }
        if (indicator !== ' ') {
            errors.push({
                line: lineNum,
                column: 7,
                code: 'IGYPS2004-S',
                message: `INVALID INDICATOR '${indicator}' IN COLUMN 7`,
                severity: 'ERROR'
            });
            continue;
        }
      }

      // 3. Area A and Area B Analysis
      // Area A: Indices 7, 8, 9, 10 (Cols 8-11)
      // Area B: Indices 11...71 (Cols 12-72)
      
      if (rawLine.length < 8) continue; // Too short for code

      const content = rawLine.substring(7, Math.min(rawLine.length, 72));
      const firstCharIdx = content.search(/\S/);
      
      if (firstCharIdx === -1) continue; // Blank line in code area

      const startCol = firstCharIdx + 8; // Convert to 1-based column
      const firstWordMatch = content.match(/^\s*(\S+)/);
      const firstWord = firstWordMatch ? firstWordMatch[1].toUpperCase() : "";
      
      // Update Division State based on keywords (Must include DIVISION)
      const upperLine = content.toUpperCase();
      if (firstWord === 'IDENTIFICATION' && upperLine.includes('DIVISION')) currentDivision = 'ID';
      else if (firstWord === 'ENVIRONMENT' && upperLine.includes('DIVISION')) currentDivision = 'ENV';
      else if (firstWord === 'DATA' && upperLine.includes('DIVISION')) currentDivision = 'DATA';
      else if (firstWord === 'PROCEDURE' && upperLine.includes('DIVISION')) currentDivision = 'PROC';

      // --- Rule Enforcement ---

      const isAreaA = startCol >= 8 && startCol <= 11;
      const isAreaB = startCol >= 12;

      // Rule: Division Headers must be in Area A
      if (this.AREA_A_KEYWORDS.has(firstWord)) {
          if (isAreaB) {
              errors.push({
                  line: lineNum,
                  column: startCol,
                  code: 'IGYPS1088-S',
                  message: `HEADER '${firstWord}' SHOULD START IN AREA A (COLS 8-11)`,
                  severity: 'ERROR'
              });
          }
          continue; 
      }

      // Rule: Level Numbers
      if (/^\d+$/.test(firstWord)) {
          const level = parseInt(firstWord, 10);
          
          // 01 and 77 MUST be in Area A
          if (level === 1 || level === 77) {
              if (isAreaB) {
                 errors.push({
                    line: lineNum,
                    column: startCol,
                    code: 'IGYPS1099-S',
                    message: `LEVEL ${firstWord} MUST BE IN AREA A`,
                    severity: 'ERROR'
                 });
              }
          }
          // 66 and 88 MUST be in Area B
          else if (level === 66 || level === 88) {
              if (isAreaA) {
                  errors.push({
                    line: lineNum,
                    column: startCol,
                    code: 'IGYPS1100-S',
                    message: `LEVEL ${firstWord} MUST BE IN AREA B`,
                    severity: 'ERROR'
                 });
              }
          }
          continue;
      }

      // Rule: Verbs (Area B only)
      if (this.AREA_B_KEYWORDS.has(firstWord)) {
          if (isAreaA) {
              errors.push({
                  line: lineNum,
                  column: startCol,
                  code: 'IGYPS1088-S',
                  message: `STATEMENT '${firstWord}' NOT ALLOWED IN AREA A`,
                  severity: 'ERROR'
              });
          }
          continue;
      }

      // Rule: Paragraphs (Procedure Division)
      if (currentDivision === 'PROC') {
          // Paragraph definition in Area B?
          if (isAreaB && firstWord.endsWith('.')) {
              // Extract potential paragraph name
              const rootWord = firstWord.slice(0, -1);
              
              // Only warn if it's NOT a verb (Avoid false positive on EXIT. STOP. GOBACK.)
              if (!this.AREA_B_KEYWORDS.has(rootWord)) {
                  errors.push({
                      line: lineNum,
                      column: startCol,
                      code: 'IGYPS1011-W',
                      message: `PARAGRAPH '${firstWord}' SHOULD START IN AREA A`,
                      severity: 'WARNING'
                  });
              }
          }
      }

    }

    return errors;
  }
}
