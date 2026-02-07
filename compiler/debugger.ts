
import { DebugAdapter, StatementNode, StackFrame, VariableContext } from './types';

export type DebugStatus = 'STOPPED' | 'RUNNING' | 'PAUSED' | 'TERMINATED';

export interface DebuggerEvents {
    onStatusChange: (status: DebugStatus) => void;
    onStatement: (line: number) => void;
    onVariables: (vars: Map<string, VariableContext>) => void;
}

export class Debugger implements DebugAdapter {
    private status: DebugStatus = 'STOPPED';
    private breakpoints: Set<number> = new Set();
    
    private resumeSignal: ((value?: unknown) => void) | null = null;
    private mode: 'STEP' | 'RUN' | 'NEXT' = 'RUN';
    private targetStackDepth: number = -1;

    private events: DebuggerEvents;

    constructor(events: DebuggerEvents) {
        this.events = events;
    }

    public toggleBreakpoint(line: number) {
        if (this.breakpoints.has(line)) {
            this.breakpoints.delete(line);
        } else {
            this.breakpoints.add(line);
        }
    }

    public pause() {
        this.updateStatus('PAUSED');
    }

    public step() {
        this.mode = 'STEP';
        this.resume();
    }

    public next() {
        this.mode = 'NEXT';
        this.targetStackDepth = -1; 
        this.resume();
    }

    public continue() {
        this.mode = 'RUN';
        this.resume();
    }

    private resume() {
        this.updateStatus('RUNNING');
        if (this.resumeSignal) {
            const resolve = this.resumeSignal;
            this.resumeSignal = null;
            resolve();
        }
    }

    private updateStatus(newStatus: DebugStatus) {
        this.status = newStatus;
        this.events.onStatusChange(newStatus);
    }

    public async onStatement(stmt: StatementNode, stack: StackFrame[]): Promise<void> {
        if (stmt.line) {
             this.events.onStatement(stmt.line);
        }

        // Aggregate variables from the TOP frame only (Current Scope)
        if (stack.length > 0) {
            const currentFrame = stack[stack.length - 1];
            const vars = new Map(currentFrame.memory);
            currentFrame.linkage.forEach((v, k) => vars.set(k, v));
            this.events.onVariables(vars);
        } else {
            this.events.onVariables(new Map());
        }

        const shouldBreak = this.checkBreakConditions(stmt, stack.length);

        if (shouldBreak) {
            this.updateStatus('PAUSED');
            return new Promise((resolve) => {
                this.resumeSignal = resolve;
            });
        }
        return Promise.resolve();
    }

    private checkBreakConditions(stmt: StatementNode, depth: number): boolean {
        if (this.status === 'PAUSED') return true;
        const line = stmt.line || 0;
        if (line > 0 && this.breakpoints.has(line)) return true;

        if (this.mode === 'STEP') return true;

        if (this.mode === 'NEXT') {
            if (this.targetStackDepth === -1) {
                // We capture the depth at the start of NEXT.
                // NOTE: 'depth' here is Call Stack Depth. 
                // However, NEXT usually implies "Same logical stack frame level".
                // If we CALL a program, depth increases. We don't want to break inside it.
                // We wait until depth returns to <= current.
                this.targetStackDepth = depth;
                return false; 
            }
            if (depth <= this.targetStackDepth) {
                return true;
            }
        }
        return false;
    }
}
