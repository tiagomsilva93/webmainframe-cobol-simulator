
export interface ValidationError {
  line: number;
  column: number;
  code: string;
  message: string;
}

export class Validator {
  // Verbs that MUST start in Area B (Cols 12-72)
  private static AREA_B_VERBS = new Set([
    'ACCEPT', 'ADD', 'CALL', 'CLOSE', 'COMPUTE', 'CONTINUE', 'DELETE', 
    'DISPLAY', 'DIVIDE', 'EVALUATE', 'EXIT', 'GO', 'IF', 'INITIALIZE', 
    'INSPECT', 'MERGE', 'MOVE', 'MULTIPLY', 'OPEN', 'PERFORM', 'READ', 
    'RELEASE', 'RETURN', 'REWRITE', 'SEARCH', 'SET', 'SORT', 'START', 
    'STOP', 'STRING', 'SUBTRACT', 'UNSTRING', 'WRITE', 'ELSE', 'END-IF', 
    'END-PERFORM', 'THEN'
  ]);

  public static validate(source: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip empty lines (conceptually valid or ignored)
      if (line.trim().length === 0) continue;

      // 1. Check Line Length (Optional warning, but usually ignored in modern web sims)
      // Standard COBOL is 80 cols. We won't error on length > 80, just ignore cols 73+

      // 2. Check Indicator Area (Col 7, Index 6)
      if (line.length >= 7) {
        const indicator = line[6];
        if (indicator === '*' || indicator === '/') {
          continue; // Comment line, skip validation
        }
        if (indicator === 'D' || indicator === 'd') {
            // Debug line, treat as code or comment depending on mode. 
            // For this sim, we treat as comment/ignore or normal code? 
            // Standard says treat as code if WITH DEBUGGING MODE. We'll skip for now or treat as comment.
            continue; 
        }
        if (indicator !== ' ' && indicator !== '-') {
             // Strict error for invalid indicator? Or just treat as space?
             // IBM compiler might flag this. Let's be strict.
             // errors.push({
             //    line: lineNum, column: 7, code: 'IGYPS1001-E', 
             //    message: 'INVALID INDICATOR ' + indicator
             // });
        }
      }

      // 3. Check Area A (Cols 8-11, Indices 7-10)
      // Only strict requirement: Statements must NOT be here.
      if (line.length > 7) {
          const areaA = line.substring(7, 11).toUpperCase();
          
          // Regex to find the first word in Area A
          const match = areaA.match(/^(\S+)/);
          
          if (match) {
              const firstWord = match[1];
              // If the word starting in Area A is a Verb, it's an error.
              if (this.AREA_B_VERBS.has(firstWord)) {
                  // Determine precise column of the word
                  const colIdx = line.indexOf(match[1], 7); // Search starting from index 7
                  errors.push({
                      line: lineNum,
                      column: colIdx + 1, // 1-based
                      code: 'IGYDS1088-S',
                      message: `STATEMENT NOT ALLOWED IN AREA A. FOUND '${firstWord}'`
                  });
              }
          }
      }
    }

    return errors;
  }
}
