
export interface PreprocessorResult {
  expandedSource: string;
  missingCopy?: {
    name: string;
    line: number;
    column: number;
  };
  error?: string;
}

export class Preprocessor {
  
  /**
   * Main entry point. 
   * Recursively resolves COPY statements. 
   * Returns immediately if a COPY is missing so the UI can prompt for it.
   */
  public static process(source: string, library: Map<string, string>): PreprocessorResult {
    let lines = source.split('\n');
    let hasChanges = true;
    
    // Safety limit to prevent infinite recursion in circular copies
    let loops = 0;
    const MAX_LOOPS = 100;

    while (hasChanges && loops < MAX_LOOPS) {
      hasChanges = false;
      loops++;
      
      const newLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 1. Validate line length & Indicator area
        if (line.length < 7) {
          newLines.push(line);
          continue;
        }

        // Check for comment
        const indicator = line[6];
        if (indicator === '*' || indicator === '/') {
          newLines.push(line);
          continue;
        }

        // 2. Search for COPY in Area B (Cols 12+, Index 11+)
        const contentArea = line.substring(6); // Col 7 onwards
        const upperContent = contentArea.toUpperCase();
        
        // Match COPY <name> [REPLACING ...] .
        const copyIdx = upperContent.indexOf(' COPY ');
        const copyStartAtStart = upperContent.trimStart().startsWith('COPY ');
        
        let actualCopyIdx = -1;
        if (copyStartAtStart) {
            actualCopyIdx = upperContent.indexOf('COPY');
        } else if (copyIdx !== -1) {
            actualCopyIdx = copyIdx + 1; // +1 for space
        }

        if (actualCopyIdx !== -1) {
           // We found a COPY statement candidate.
           // Ensure it's not inside a literal
           const textBefore = contentArea.substring(0, actualCopyIdx);
           const quoteCount = (textBefore.match(/"/g) || []).length + (textBefore.match(/'/g) || []).length;
           
           if (quoteCount % 2 === 0) {
              // Valid COPY statement
              const statementStr = contentArea.substring(actualCopyIdx);
              
              // Extract COPYBOOK name
              // Regex: COPY\s+([\w-]+)(.*)\.
              const match = statementStr.match(/^COPY\s+([\w-]+)(.*)$/i);
              
              if (match) {
                 const bookName = match[1].toUpperCase();
                 const remainder = match[2]; // Might contain REPLACING ... .
                 
                 // Check if we have this book
                 if (!library.has(bookName)) {
                    return {
                       expandedSource: lines.join('\n'), // Return current state
                       missingCopy: {
                          name: bookName,
                          line: i + 1,
                          column: 7 + actualCopyIdx + 1
                       }
                    };
                 }

                 // We have the book. Process it.
                 const rawBookContent = library.get(bookName) || "";
                 
                 try {
                    // Normalize book content (strip sequence numbers if present in 1-6)
                    // and apply REPLACING if needed.
                    const injectedLines = this.prepareCopybook(rawBookContent, remainder, bookName);
                    
                    // Add comments indicating start/end of copy
                    newLines.push(`      *++ BEGIN COPY ${bookName}`);
                    newLines.push(...injectedLines);
                    newLines.push(`      *++ END COPY ${bookName}`);
                    
                    hasChanges = true; // We modified source, need to re-scan
                    continue; // Skip pushing the original COPY line
                 } catch (e: any) {
                    return {
                        expandedSource: lines.join('\n'),
                        error: e.message
                    };
                 }
              }
           }
        }

        newLines.push(line);
      }
      
      lines = newLines;
    }

    if (loops >= MAX_LOOPS) {
       return {
          expandedSource: lines.join('\n'),
          error: 'IGYDS1090-S COMPILER LIMIT EXCEEDED: NESTED COPY DEPTH.'
       };
    }

    return { expandedSource: lines.join('\n') };
  }

  private static prepareCopybook(content: string, replacingClause: string, bookName: string): string[] {
    let lines = content.split('\n');
    const processed: string[] = [];

    // Check for REPLACING logic
    const replacements: {from: string, to: string}[] = [];
    
    if (replacingClause && replacingClause.includes('REPLACING')) {
       const regex = /(?:==|'|")(.+?)(?:==|'|")\s+BY\s+(?:==|'|")(.+?)(?:==|'|")/gi;
       let match;
       while ((match = regex.exec(replacingClause)) !== null) {
          replacements.push({ from: match[1], to: match[2] });
       }
    }

    for (let i = 0; i < lines.length; i++) {
       const line = lines[i];
       
       // Validation 1: No Division Headers in Copybooks
       if (line.includes('DIVISION') && (line.includes('IDENTIFICATION') || line.includes('ENVIRONMENT') || line.includes('DATA') || line.includes('PROCEDURE'))) {
           throw new Error(`IGYDS2070-S COPYBOOK ${bookName} CONTAINS ILLEGAL HEADER '${line.trim()}'. COPYBOOKS CANNOT CONTAIN DIVISIONS.`);
       }

       // Validation 2: Line Length (ignoring comments)
       if (line.length > 72) {
           if (line.length >= 7 && line[6] !== '*') {
                // Strict validation: In real mainframes, 73-80 is ignored or used for sequence numbers.
                // However, if meaningful code extends there, it's a bug.
                // We will warn or error. For robustness, let's treat as error if it looks like code.
                throw new Error(`IGYDS2071-S COPYBOOK ${bookName} LINE ${i+1} EXCEEDS COLUMN 72.`);
           }
       }

       // Apply Replacements
       let contentLine = line;
       if (replacements.length > 0) {
          replacements.forEach(rep => {
             const escapedFrom = rep.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
             const r = new RegExp(escapedFrom, 'g');
             contentLine = contentLine.replace(r, rep.to);
          });
       }
       
       processed.push(contentLine);
    }
    
    return processed;
  }
}
