
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MainframeLayout } from './components/MainframeLayout';
import { Screen } from './components/Screen';
import { CobolStudioView } from './components/CobolStudioView';
import { InputModal } from './components/InputModal';
import { Lexer } from './compiler/lexer';
import { Parser } from './compiler/parser';
import { Runtime, ScreenChar } from './compiler/runtime';
import { IspfRuntime } from './compiler/ispf';
import { Validator } from './compiler/validator';
import { Preprocessor } from './compiler/preprocessor';
import { SAMPLE_CODE, PANEL_ISR_PRIM, PANEL_ISPOPT } from './constants';
import { Token, Diagnostic, ProgramNode } from './compiler/types';

interface InputRequest {
  variableName: string;
  picType: 'X' | '9';
  picLength: number;
}

const App: React.FC = () => {
  // Global State
  const [currentView, setCurrentView] = useState<'ISPF' | 'COBOL_STUDIO' | 'COBOL_RUN'>('ISPF');
  const [status, setStatus] = useState("ISPF ACTIVE");
  
  // Data State
  const [datasetContent, setDatasetContent] = useState(SAMPLE_CODE);
  const [logs, setLogs] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  // ISPF Runtime
  const ispfRef = useRef<IspfRuntime>(new IspfRuntime());
  const [ispfBuffer, setIspfBuffer] = useState<ScreenChar[]>([]);
  const [ispfCursor, setIspfCursor] = useState<number>(0);

  // COBOL Runtime
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [inputData, setInputData] = useState<InputRequest>({ variableName: '', picType: 'X', picLength: 0 });
  const inputResolveRef = useRef<((value: string) => void) | null>(null);
  const [cicsBuffer, setCicsBuffer] = useState<ScreenChar[]>(Array(24*80).fill({char:' ', attr:0}));
  const [isWaitingForScreen, setIsWaitingForScreen] = useState(false);
  const screenResolveRef = useRef<(() => void) | null>(null);
  const cobolRuntimeRef = useRef<Runtime | null>(null);

  // Init ISPF
  useEffect(() => {
      const ispf = ispfRef.current;
      ispf.registerPanel(PANEL_ISR_PRIM);
      ispf.registerPanel(PANEL_ISPOPT);
      ispf.start('UNKNOWN');
      ispf['panelRepo'].set('ISR@PRIM', ispf['parsePanel'](PANEL_ISR_PRIM));
      ispf['panelRepo'].set('ISPOPT', ispf['parsePanel'](PANEL_ISPOPT));
      
      ispf.start('ISR@PRIM');
      setIspfBuffer([...ispf.screenBuffer]);
      setIspfCursor(ispf.cursor.row * 80 + ispf.cursor.col);
  }, []);

  // Real-time Validation Effect
  useEffect(() => {
      const timer = setTimeout(() => {
          // Mock Preprocessor
          const prep = Preprocessor.process(datasetContent, new Map());
          // Run Validation
          const errors = Validator.validate(prep.expandedSource);
          
          // Map to Diagnostics format
          const diags: Diagnostic[] = errors.map(e => ({
              line: e.line,
              column: e.column,
              code: e.code,
              message: e.message,
              severity: e.severity
          }));
          
          setDiagnostics(diags);
          
          if (currentView === 'COBOL_STUDIO') {
             if (diags.some(d => d.severity === 'ERROR')) setStatus("COBOL STUDIO - SYNTAX ERROR");
             else setStatus("COBOL STUDIO - READY");
          }

      }, 800); // 800ms debounce

      return () => clearTimeout(timer);
  }, [datasetContent, currentView]);

  // --- Handlers ---

  const handleIspfInput = (buffer: ScreenChar[]) => {
      ispfRef.current.handleInput(buffer);
      const nav = ispfRef.current.evalZSEL();
      ispfRef.current.clearZCMD();
      
      if (nav === 'PGM(STUDIO)') {
          setCurrentView('COBOL_STUDIO');
          setStatus("DUCK COBOL STUDIO");
          setLogs(["READY FOR EXECUTION."]);
      } 
      else if (nav === 'PGM(UTILS)' || nav === 'PGM(TOOLS)') {
           ispfRef.current.message = "FEATURE COMING SOON";
           setIspfBuffer([...ispfRef.current.screenBuffer]);
      }
      else if (nav === 'EXIT') {
          ispfRef.current.start('ISR@PRIM');
          setIspfBuffer([...ispfRef.current.screenBuffer]);
      }
      else {
          setIspfBuffer([...ispfRef.current.screenBuffer]);
      }
      
      const c = ispfRef.current.cursor;
      setIspfCursor(c.row * 80 + c.col);
  };

  const handleEditorChange = (newContent: string) => {
      setDatasetContent(newContent);
  };

  const handleStudioExit = () => {
      setCurrentView('ISPF');
      setStatus("ISPF PRIMARY OPTION MENU");
      ispfRef.current.start('ISR@PRIM');
      setIspfBuffer([...ispfRef.current.screenBuffer]);
      const c = ispfRef.current.cursor;
      setIspfCursor(c.row * 80 + c.col);
  };

  // --- COBOL Compilation & Run ---

  const handleRuntimeInput = useCallback((variableName: string, picType: 'X'|'9', length: number): Promise<string> => {
    return new Promise((resolve) => {
        setInputData({ variableName, picType, picLength: length });
        setIsInputOpen(true);
        inputResolveRef.current = resolve;
    });
  }, []);

  const handleScreenUpdate = useCallback((buffer: ScreenChar[]) => {
      setCicsBuffer(buffer);
  }, []);

  const handleScreenInputRequest = useCallback((): Promise<void> => {
      setIsWaitingForScreen(true);
      return new Promise((resolve) => {
          screenResolveRef.current = resolve;
      });
  }, []);

  const handleCicsInputSubmit = (finalBuffer: ScreenChar[]) => {
      if (isWaitingForScreen && screenResolveRef.current) {
          if (cobolRuntimeRef.current) {
               const ctx = cobolRuntimeRef.current.getCICSContext();
               for(let i=0; i<finalBuffer.length; i++) ctx.screenBuffer[i] = finalBuffer[i];
          }
          setIsWaitingForScreen(false);
          screenResolveRef.current();
          screenResolveRef.current = null;
      }
  };

  const handleInputModalSubmit = (value: string) => {
    setIsInputOpen(false);
    if (inputResolveRef.current) {
        inputResolveRef.current(value);
        inputResolveRef.current = null;
    }
  };

  const runCompilationProcess = async () => {
    setStatus("COMPILING...");
    setLogs(["COMPILING..."]);
    
    // Check validation first
    const prep = Preprocessor.process(datasetContent, new Map());
    const validationErrors = Validator.validate(prep.expandedSource);
    
    // Update diagnostics immediately
    setDiagnostics(validationErrors.map(e => ({
        line: e.line, column: e.column, code: e.code, message: e.message, severity: e.severity
    })));

    if (validationErrors.some(e => e.severity === 'ERROR')) {
        setLogs(["COMPILATION FAILED. CHECK DIAGNOSTICS."]);
        setStatus("COMPILATION FAILED");
        return;
    }

    const tokens = new Lexer(prep.expandedSource).tokenize();
    let ast: ProgramNode | undefined;
    try {
        ast = new Parser(tokens).parse();
    } catch(e:any) {
        setLogs([`PARSER ERROR: ${e.message}`]);
        return;
    }

    setStatus("EXECUTING...");
    // If it's a CICS/Interactive program, switch to COBOL_RUN. 
    // Otherwise keep showing logs in Studio View.
    // Heuristic: Check if tokens include CICS or DISPLAY (Text)
    // For now: Always stay in Studio UNLESS we detect CICS commands or explicit screen usage?
    // Let's assume CICS needs full screen. Batch/Display stays in logs.
    
    const isCICS = tokens.some(t => t.value === 'CICS' || t.value === 'MAP');
    
    const runtime = new Runtime(handleRuntimeInput, handleScreenUpdate, handleScreenInputRequest);
    cobolRuntimeRef.current = runtime;

    if (isCICS) {
         setCurrentView('COBOL_RUN');
    }

    setTimeout(async () => {
        const res = await runtime.run(ast!);
        
        // Append execution logs to existing logs
        const newLogs = ["--- EXECUTION STARTED ---", ...res.output, "--- EXECUTION ENDED ---"];
        if (res.errors.length > 0) {
            newLogs.push("ERRORS:");
            newLogs.push(...res.errors);
            setStatus("JOB FAILED");
        } else {
            setStatus("JOB ENDED RC=0000");
        }
        
        setLogs(newLogs);
        
        if (isCICS) {
            // Return to Studio after CICS ends?
            // Or let user exit.
            // For now, auto return to studio after 2s if needed, or provide button.
            // Let's stay in CICS screen until user exits via F3 (handled in Screen component? No logic yet).
            // We will force return to studio for now after short delay if no error?
            // Better: Add exit button in COBOL_RUN view.
             setCurrentView('COBOL_STUDIO');
        }
    }, 100);
  };

  return (
    <MainframeLayout 
        onRun={currentView === 'COBOL_STUDIO' ? runCompilationProcess : () => {}} 
        onReset={() => {}} 
        onLoad={() => {}} 
        statusMessage={status}
    >
        <InputModal 
            isOpen={isInputOpen}
            variableName={inputData.variableName}
            picType={inputData.picType}
            picLength={inputData.picLength}
            onSubmit={handleInputModalSubmit}
        />

        {currentView === 'ISPF' && (
            <Screen 
                buffer={ispfBuffer} 
                onInput={handleIspfInput} 
                active={true}
                cursorPosition={ispfCursor}
            />
        )}

        {currentView === 'COBOL_STUDIO' && (
             <CobolStudioView 
                content={datasetContent}
                onChange={handleEditorChange}
                logs={logs}
                diagnostics={diagnostics}
                onRun={runCompilationProcess}
                onExit={handleStudioExit}
             />
        )}

        {currentView === 'COBOL_RUN' && (
             <div className="relative w-full h-full">
                 <Screen 
                    buffer={cicsBuffer} 
                    onInput={handleCicsInputSubmit} 
                    active={isWaitingForScreen}
                 />
                 <button 
                    className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 border border-white z-50 text-xs font-bold"
                    onClick={() => setCurrentView('COBOL_STUDIO')}
                 >
                    EXIT CICS
                 </button>
             </div>
        )}
    </MainframeLayout>
  );
};

export default App;
