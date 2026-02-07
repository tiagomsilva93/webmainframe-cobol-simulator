
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MainframeLayout } from './components/MainframeLayout';
import { Editor } from './components/Editor';
import { Sysout } from './components/Sysout';
import { Screen } from './components/Screen';
import { IspfEditor } from './components/IspfEditor';
import { InputModal } from './components/InputModal';
import { Lexer } from './compiler/lexer';
import { Parser } from './compiler/parser';
import { Runtime, ScreenChar } from './compiler/runtime';
import { IspfRuntime } from './compiler/ispf';
import { Validator } from './compiler/validator';
import { Preprocessor } from './compiler/preprocessor';
import { SAMPLE_CODE, PANEL_ISR_PRIM, PANEL_ISPOPT } from './constants';
import { Token, Diagnostic, ProgramNode } from './compiler/types';

// ... (InputRequest interface kept)
interface InputRequest {
  variableName: string;
  picType: 'X' | '9';
  picLength: number;
}

const App: React.FC = () => {
  // Global State
  const [currentView, setCurrentView] = useState<'ISPF' | 'ISPF_EDIT' | 'COBOL_RUN' | 'SYSOUT'>('ISPF');
  const [status, setStatus] = useState("ISPF ACTIVE");
  
  // Data State
  const [datasetContent, setDatasetContent] = useState(SAMPLE_CODE);
  const [logs, setLogs] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  // ISPF Runtime
  const ispfRef = useRef<IspfRuntime>(new IspfRuntime());
  const [ispfBuffer, setIspfBuffer] = useState<ScreenChar[]>([]);

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
      ispf.start('UNKNOWN'); // Registering names manually above, but start needs name
      // Hack: Register manually extracts name from )PANEL? No, our parser is simple.
      // We will re-register with explicit names.
      // Re-init with correct map keys:
      // The parsePanel does not return name if not in )PANEL header.
      // We will force set.
      ispf['panelRepo'].set('ISR@PRIM', ispf['parsePanel'](PANEL_ISR_PRIM));
      ispf['panelRepo'].set('ISPOPT', ispf['parsePanel'](PANEL_ISPOPT));
      
      ispf.start('ISR@PRIM');
      setIspfBuffer([...ispf.screenBuffer]);
  }, []);

  // --- Handlers ---

  const handleIspfInput = (buffer: ScreenChar[]) => {
      // 1. Update ISPF Runtime
      ispfRef.current.handleInput(buffer);
      
      // 2. Check ZSEL/ZCMD for Navigation
      const nav = ispfRef.current.evalZSEL();
      ispfRef.current.clearZCMD();
      
      if (nav === 'PGM(EDIT)') {
          setCurrentView('ISPF_EDIT');
          setStatus("ISPF EDITOR");
      } 
      else if (nav === 'PGM(VIEW)' || nav === 'PGM(UTIL)') {
          // For Sim: View = Run/Compile
          runCompilationProcess();
      }
      else if (nav === 'EXIT') {
          // Reset to PRIM
          ispfRef.current.start('ISR@PRIM');
          setIspfBuffer([...ispfRef.current.screenBuffer]);
      }
      else {
          // Just rerender ISPF
          setIspfBuffer([...ispfRef.current.screenBuffer]);
      }
  };

  const handleEditorSave = (newContent: string) => {
      setDatasetContent(newContent);
  };

  const handleEditorExit = () => {
      setCurrentView('ISPF');
      setStatus("ISPF PRIMARY OPTION MENU");
      ispfRef.current.start('ISR@PRIM');
      setIspfBuffer([...ispfRef.current.screenBuffer]);
  };

  // --- COBOL Compilation & Run (reused from previous step) ---

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
    setCurrentView('SYSOUT');
    setLogs([]);
    
    // ... Compile Logic ...
    const prep = Preprocessor.process(datasetContent, new Map());
    const tokens = new Lexer(prep.expandedSource).tokenize();
    let ast: ProgramNode | undefined;
    try {
        ast = new Parser(tokens).parse();
    } catch(e:any) {
        setLogs([`PARSER ERROR: ${e.message}`]);
        return;
    }
    
    const errs = Validator.validate(prep.expandedSource);
    setDiagnostics(errs);
    
    if (errs.some(e => e.severity === 'ERROR')) {
        setStatus("COMPILATION FAILED");
        return;
    }

    setStatus("EXECUTING...");
    setCurrentView('COBOL_RUN'); // If Batch (Text output) -> SYSOUT? If CICS -> COBOL_RUN
    
    // Heuristic: If SEND MAP found in tokens, force CICS screen view
    // For now always use COBOL_RUN which renders Screen OR Logs depending on mode?
    // We'll overlay Sysout if output is text-only later.
    
    const runtime = new Runtime(handleRuntimeInput, handleScreenUpdate, handleScreenInputRequest);
    cobolRuntimeRef.current = runtime;
    
    setTimeout(async () => {
        const res = await runtime.run(ast!);
        setLogs(res.output);
        if (res.errors.length > 0) setStatus("JOB FAILED");
        else setStatus("JOB ENDED");
        
        // If it was batch (no CICS screen usage), show Sysout
        // We check if screenBuffer is empty or dirty? 
        // For Sim: Show Sysout always at end.
        setCurrentView('SYSOUT');
    }, 100);
  };

  return (
    <MainframeLayout 
        onRun={() => {}} 
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
            />
        )}

        {currentView === 'ISPF_EDIT' && (
            <div className="w-full h-full">
                <IspfEditor 
                    initialContent={datasetContent}
                    onSave={handleEditorSave}
                    onExit={handleEditorExit}
                    datasetName="'USER.COBOL(SOURCE)'"
                />
            </div>
        )}

        {currentView === 'COBOL_RUN' && (
             <Screen 
                buffer={cicsBuffer} 
                onInput={handleCicsInputSubmit} 
                active={isWaitingForScreen}
             />
        )}

        {currentView === 'SYSOUT' && (
            <div className="flex flex-col w-full h-full relative">
                 <div className="absolute top-0 right-0 p-2 z-50">
                     <button onClick={handleEditorExit} className="bg-red-600 text-white px-4 font-bold border border-white">EXIT TO ISPF</button>
                 </div>
                 <Sysout logs={logs} diagnostics={diagnostics} />
            </div>
        )}

    </MainframeLayout>
  );
};

export default App;
