
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MainframeLayout } from './components/MainframeLayout';
import { Editor } from './components/Editor';
import { Sysout } from './components/Sysout';
import { InputModal } from './components/InputModal';
import { CopybookModal } from './components/CopybookModal';
import { Lexer } from './compiler/lexer';
import { Parser } from './compiler/parser';
import { Runtime } from './compiler/runtime';
import { Validator, ValidationError } from './compiler/validator';
import { Preprocessor, PreprocessorResult } from './compiler/preprocessor';
import { SAMPLE_CODE } from './constants';
import { ASTNode } from './compiler/types';

interface InputRequest {
  variableName: string;
  picType: 'X' | '9';
  picLength: number;
}

interface MissingCopyState {
  name: string;
  line: number;
  col: number;
}

const App: React.FC = () => {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [logs, setLogs] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]); 
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]); 
  const [status, setStatus] = useState("READY");
  const [ast, setAst] = useState<ASTNode | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Runtime Input Modal State
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [inputData, setInputData] = useState<InputRequest>({ variableName: '', picType: 'X', picLength: 0 });
  const inputResolveRef = useRef<((value: string) => void) | null>(null);

  // Copybook Handling State
  const [copybookLibrary, setCopybookLibrary] = useState<Map<string, string>>(new Map());
  const [missingCopy, setMissingCopy] = useState<MissingCopyState | null>(null);

  const handleRuntimeInput = useCallback((variableName: string, picType: 'X'|'9', length: number): Promise<string> => {
    return new Promise((resolve) => {
        setInputData({ variableName, picType, picLength: length });
        setIsInputOpen(true);
        inputResolveRef.current = resolve;
    });
  }, []);

  const handleInputSubmit = (value: string) => {
    setIsInputOpen(false);
    if (inputResolveRef.current) {
        inputResolveRef.current(value);
        inputResolveRef.current = null;
    }
  };

  // --- Copybook Modal Handlers ---

  const handleCopybookSubmit = (content: string) => {
    if (!missingCopy) return;
    
    // Register the new copybook
    const newLib = new Map(copybookLibrary);
    newLib.set(missingCopy.name, content);
    setCopybookLibrary(newLib);
    setMissingCopy(null);

    // Resume Compilation immediately
    runCompilationProcess(newLib); 
  };

  const handleCopybookCancel = () => {
    if (missingCopy) {
      setErrors([
         `IGYDS1089-S COPYBOOK ${missingCopy.name} NOT FOUND.`,
         `LINE ${missingCopy.line}, COLUMN ${missingCopy.col}.`,
         `COMPILATION CANCELLED BY USER.`
      ]);
      setStatus("COMPILATION FAILED");
      setMissingCopy(null);
    }
  };

  // --- Main Compilation Process ---

  const runCode = () => {
    runCompilationProcess(new Map());
  };

  const runCompilationProcess = useCallback(async (currentLibrary: Map<string, string>) => {
    setStatus("PRE-PROCESSING...");
    setErrors([]);
    setValidationErrors([]);
    setLogs([]); 
    // Do not clear AST immediately to prevent flashing, update it on successful parse

    // 1. Preprocessor (Expand COPY statements)
    try {
        const prepResult = Preprocessor.process(code, currentLibrary);

        if (prepResult.missingCopy) {
            setMissingCopy({
                name: prepResult.missingCopy.name,
                line: prepResult.missingCopy.line,
                col: prepResult.missingCopy.column
            });
            setStatus("WAITING FOR COPYBOOK");
            return; // PAUSE here
        }

        if (prepResult.error) {
            setErrors([prepResult.error]);
            setStatus("PRE-PROCESS ERROR");
            return; // ABORT
        }

        const expandedSource = prepResult.expandedSource;

        // 2. Validator
        const valErrors = Validator.validate(expandedSource);
        
        // Split errors based on severity
        const severeErrors = valErrors.filter(e => e.severity === 'ERROR');
        const nonSevereErrors = valErrors.filter(e => e.severity === 'WARNING' || e.severity === 'INFO');

        // Always show validations in Editor
        setValidationErrors(valErrors);

        // Populate initial non-severe messages to Sysout
        if (nonSevereErrors.length > 0) {
             const formattedMsgs = nonSevereErrors.map(e => 
                `${e.code} ${e.message}\nLINE ${e.line}, COLUMN ${e.column}.`
             );
             setErrors(formattedMsgs);
        }

        // Check blocking errors
        if (severeErrors.length > 0) {
            const formattedErrors = severeErrors.map(e => 
                `${e.code} ${e.message}\nLINE ${e.line}, COLUMN ${e.column}.`
            );
            // Prepend severe errors to any existing warnings
            setErrors(prev => [...formattedErrors, ...prev]);
            setStatus("COMPILATION ERROR");
            return; // STRICT BLOCK
        }

        // 3. Lexer & Parser (Wrapped in try/catch for fatal syntax errors)
        try {
            const lexer = new Lexer(expandedSource);
            const tokens = lexer.tokenize();
            
            const parser = new Parser(tokens);
            const parsedProgram = parser.parse();
            
            // Success! Update AST
            setAst(parsedProgram.debugAST);

            setStatus("EXECUTING...");

            // 5. Runtime (Only reached if no severe errors occurred)
            const runtime = new Runtime(handleRuntimeInput);
            
            setTimeout(async () => {
                const result = await runtime.run(parsedProgram);
                setLogs(result.output);
                
                // Append runtime errors (if any)
                if (result.errors.length > 0) {
                    setErrors(prev => [...prev, ...result.errors]);
                }
                
                // If we had compilation warnings but runtime succeeded, status is OK (but MAXCC=4 in Sysout)
                // If runtime failed, JOB FAILED
                setStatus(result.errors.length > 0 ? "JOB FAILED" : "JOB ENDED");
            }, 100);

        } catch (e: any) {
            // Lexer or Parser Fatal Error
            console.error(e);
            const msg = e.message || "Unknown Compilation Error";
            
            // Try to extract line/col from error message to show in Editor
            const match = msg.match(/Line (\d+), Column (\d+)/);
            if (match) {
                const line = parseInt(match[1], 10);
                const col = parseInt(match[2], 10);
                setValidationErrors(prev => [...prev, {
                    line,
                    column: col,
                    code: 'IGYPS2120-S',
                    message: msg,
                    severity: 'ERROR' // Parser errors are fatal
                }]);
            }

            setErrors(prev => [msg, ...prev]);
            setStatus("COMPILATION ERROR");
        }

    } catch (e: any) {
        console.error(e);
        setErrors([e.message || "System Error"]);
        setStatus("SYSTEM ABEND");
    }
  }, [code, handleRuntimeInput]);

  const resetCode = useCallback(() => {
    setCode(SAMPLE_CODE);
    setLogs([]);
    setErrors([]);
    setValidationErrors([]);
    setAst(undefined);
    setCopybookLibrary(new Map());
    setStatus("READY");
  }, []);

  const triggerFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (typeof content === 'string') {
        setCode(content);
        setLogs([]);
        setErrors([]);
        setValidationErrors([]);
        setAst(undefined);
        setStatus(`LOADED: ${file.name.toUpperCase().substring(0, 8)}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Initial Run to populate AST (Silent)
  useEffect(() => {
     // Optional: Run parsing silently on mount to get initial highlighting
     // But strictly we might just want to wait for user or use fallback highlighting
     runCode();
  }, []);

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputOpen || missingCopy) return;

      if (e.key === 'F1') {
        e.preventDefault();
        runCode();
      } else if (e.key === 'F3') {
        e.preventDefault();
        resetCode();
      } else if (e.key === 'F5') {
        e.preventDefault();
        triggerFileUpload();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [runCode, resetCode, triggerFileUpload, isInputOpen, missingCopy]);

  return (
    <MainframeLayout 
        onRun={runCode} 
        onReset={resetCode} 
        onLoad={triggerFileUpload}
        statusMessage={status}
    >
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".txt,.cbl,.cob,.cobol"
        />
        
        <InputModal 
            isOpen={isInputOpen}
            variableName={inputData.variableName}
            picType={inputData.picType}
            picLength={inputData.picLength}
            onSubmit={handleInputSubmit}
        />

        <CopybookModal
            isOpen={!!missingCopy}
            copybookName={missingCopy?.name || ""}
            foundAtLine={missingCopy?.line || 0}
            foundAtCol={missingCopy?.col || 0}
            onSubmit={handleCopybookSubmit}
            onCancel={handleCopybookCancel}
        />

        <Editor 
          code={code} 
          onChange={(newCode) => {
             setCode(newCode);
          }} 
          errors={validationErrors}
          ast={ast}
        />
        <Sysout logs={logs} errors={errors} />
    </MainframeLayout>
  );
};

export default App;
