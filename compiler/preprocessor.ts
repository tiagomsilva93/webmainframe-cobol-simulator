
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
        // Simple regex to find "COPY" keyword not in a string literal
        // NOTE: This is a simplified scanner. It assumes COPY is on one line or simple format.
        const contentArea = line.substring(6); // Col 7 onwards
        const upperContent = contentArea.toUpperCase();
        
        // Match COPY <name> [REPLACING ...] .
        // We look for word boundary COPY
        const copyIdx = upperContent.indexOf(' COPY ');
        const copyStartAtStart = upperContent.trimStart().startsWith('COPY ');
        
        // Determine actual index in the substring
        let actualCopyIdx = -1;
        if (copyStartAtStart) {
            actualCopyIdx = upperContent.indexOf('COPY');
        } else if (copyIdx !== -1) {
            actualCopyIdx = copyIdx + 1; // +1 for space
        }

        if (actualCopyIdx !== -1) {
           // We found a COPY statement candidates.
           // Ensure it's not inside a literal (basic check)
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
                 
                 // Normalize book content (strip sequence numbers if present in 1-6)
                 // and apply REPLACING if needed.
                 const injectedLines = this.prepareCopybook(rawBookContent, remainder);
                 
                 // Add comments indicating start/end of copy (optional but good for debugging)
                 newLines.push(`      *++ BEGIN COPY ${bookName}`);
                 newLines.push(...injectedLines);
                 newLines.push(`      *++ END COPY ${bookName}`);
                 
                 hasChanges = true; // We modified source, need to re-scan
                 continue; // Skip pushing the original COPY line
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

  private static prepareCopybook(content: string, replacingClause: string): string[] {
    let lines = content.split('\n');
    const processed: string[] = [];

    // Check for REPLACING logic
    // Syntax: REPLACING ==OLD== BY ==NEW==
    // OR: REPLACING 'OLD' BY 'NEW'
    const replacements: {from: string, to: string}[] = [];
    
    if (replacingClause && replacingClause.includes('REPLACING')) {
       // Simplified parsing of REPLACING clause
       // This regex captures ==X== BY ==Y== pairs
       const regex = /(?:==|'|")(.+?)(?:==|'|")\s+BY\s+(?:==|'|")(.+?)(?:==|'|")/gi;
       let match;
       while ((match = regex.exec(replacingClause)) !== null) {
          replacements.push({ from: match[1], to: match[2] });
       }
    }

    for (let line of lines) {
       // Normalize: If line is full 80 chars, preserve. 
       // If it looks like raw code without cols 1-6, pad it.
       // For this sim, we assume the user pastes code that might or might not have area A/B padding.
       // But strictly, copybooks usually come as raw source lines.
       
       // Handle text replacement
       let contentLine = line;
       
       if (replacements.length > 0) {
          replacements.forEach(rep => {
             // Global replace
             // Escape special regex chars in 'from'
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
