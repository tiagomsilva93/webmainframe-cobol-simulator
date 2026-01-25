
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
    // We pass the Updated Library specifically because setState is async
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
    // Start fresh
    setCopybookLibrary(new Map()); // Optional: Clear cache on fresh run? ISPF usually keeps it, but let's clear for simulation purity or keep it? 
    // Let's clear it to ensure the user can re-upload if they fixed a file on disk.
    runCompilationProcess(new Map());
  };

  const runCompilationProcess = useCallback(async (currentLibrary: Map<string, string>) => {
    setStatus("PRE-PROCESSING...");
    setErrors([]);
    setValidationErrors([]);
    setLogs([]);

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
            return;
        }

        const expandedSource = prepResult.expandedSource;

        // 2. Validator
        const valErrors = Validator.validate(expandedSource);
        if (valErrors.length > 0) {
            setValidationErrors(valErrors); 
            const formattedErrors = valErrors.map(e => 
                `${e.code} ${e.message}\nLINE ${e.line}, COLUMN ${e.column}.`
            );
            setErrors(formattedErrors);
            setStatus("COMPILATION ERROR");
            return;
        }

        // 3. Lexer
        const lexer = new Lexer(expandedSource);
        const tokens = lexer.tokenize();
        
        // 4. Parser
        const parser = new Parser(tokens);
        const ast = parser.parse();

        setStatus("EXECUTING...");

        // 5. Runtime
        const runtime = new Runtime(handleRuntimeInput);
        
        setTimeout(async () => {
            const result = await runtime.run(ast);
            setLogs(result.output);
            setErrors(result.errors);
            setStatus(result.errors.length > 0 ? "JOB FAILED" : "JOB ENDED");
        }, 100);

    } catch (e: any) {
        console.error(e);
        setErrors([e.message || "Unknown Compilation Error"]);
        setStatus("COMPILATION ERROR");
    }
  }, [code, handleRuntimeInput]);

  const resetCode = useCallback(() => {
    setCode(SAMPLE_CODE);
    setLogs([]);
    setErrors([]);
    setValidationErrors([]);
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
        setStatus(`LOADED: ${file.name.toUpperCase().substring(0, 8)}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable shortcuts if modal is open
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
        
        {/* Runtime Input Modal */}
        <InputModal 
            isOpen={isInputOpen}
            variableName={inputData.variableName}
            picType={inputData.picType}
            picLength={inputData.picLength}
            onSubmit={handleInputSubmit}
        />

        {/* Copybook Request Modal */}
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
        />
        <Sysout logs={logs} errors={errors} />
    </MainframeLayout>
  );
};

export default App;
