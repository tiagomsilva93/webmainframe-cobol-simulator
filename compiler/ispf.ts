
import { ScreenChar } from './runtime';

// --- Types ---

export interface IspfAttribute {
    char: string;
    type: 'TEXT' | 'INPUT' | 'OUTPUT';
    color: 'WHITE' | 'GREEN' | 'RED' | 'BLUE' | 'YELLOW' | 'TURQ' | 'PINK';
    intens: 'HIGH' | 'LOW';
    caps?: boolean;
}

export interface IspfField {
    row: number;
    col: number;
    length: number;
    variable?: string;
    attribute: IspfAttribute;
    value: string;
}

export interface IspfPanel {
    name: string;
    attrs: Map<string, IspfAttribute>;
    bodyRows: string[]; // Raw body text
    procScript: string[];
    fields: IspfField[]; // Calculated layout
}

export interface VariablePool {
    [key: string]: string;
}

// --- Constants ---

const DEFAULT_ATTRS: IspfAttribute[] = [
    { char: '%', type: 'TEXT', color: 'WHITE', intens: 'HIGH' },
    { char: '+', type: 'TEXT', color: 'GREEN', intens: 'LOW' },
    { char: '_', type: 'INPUT', color: 'RED', intens: 'HIGH', caps: false },
    { char: '#', type: 'OUTPUT', color: 'YELLOW', intens: 'HIGH' } // Custom for sim
];

// --- Runtime ---

export class IspfRuntime {
    private variables: VariablePool = {};
    private sharedPool: VariablePool = {};
    private panelStack: string[] = []; // Stack of Panel Names
    private panelRepo: Map<string, IspfPanel> = new Map();
    
    // Screen State
    public screenBuffer: ScreenChar[];
    public cursor: { row: number, col: number } = { row: 0, col: 0 };
    public message: string = "";

    constructor() {
        this.screenBuffer = Array(24 * 80).fill(null).map(() => ({ char: ' ', attr: 0 }));
        // Init System Variables
        this.variables['ZUSER'] = 'USER';
        this.variables['ZTIME'] = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        this.variables['ZDATE'] = new Date().toLocaleDateString();
        this.variables['ZCMD'] = '';
    }

    public registerPanel(source: string) {
        const panel = this.parsePanel(source);
        this.panelRepo.set(panel.name, panel);
    }

    public start(panelName: string) {
        this.panelStack = [panelName];
        this.renderCurrentPanel();
    }

    public getCurrentPanel(): IspfPanel | undefined {
        if (this.panelStack.length === 0) return undefined;
        return this.panelRepo.get(this.panelStack[this.panelStack.length - 1]);
    }

    // --- Parsing ---

    private parsePanel(source: string): IspfPanel {
        const lines = source.split('\n');
        let section: 'NONE' | 'ATTR' | 'BODY' | 'PROC' = 'NONE';
        
        const panel: IspfPanel = {
            name: 'UNKNOWN',
            attrs: new Map(),
            bodyRows: [],
            procScript: [],
            fields: []
        };

        // Load Defaults
        DEFAULT_ATTRS.forEach(a => panel.attrs.set(a.char, a));

        for (const line of lines) {
            const trim = line.trim();
            if (trim.startsWith(')PANEL')) {
                // e.g. )PANEL KEYLIST(ISPKYLST) IMAGE(Logo)
                // We extract name manually or assume it's passed on register
                continue; 
            }
            if (trim.startsWith(')ATTR')) { section = 'ATTR'; continue; }
            if (trim.startsWith(')BODY')) { section = 'BODY'; continue; }
            if (trim.startsWith(')PROC')) { section = 'PROC'; continue; }
            if (trim.startsWith(')END')) { section = 'NONE'; break; }

            if (section === 'ATTR') {
                // Format: char TYPE(TEXT) INTENS(HIGH) ...
                const char = line.trim().substring(0, 1);
                if (char) {
                    const attr = this.parseAttribute(char, line);
                    panel.attrs.set(char, attr);
                }
            } else if (section === 'BODY') {
                panel.bodyRows.push(line);
            } else if (section === 'PROC') {
                panel.procScript.push(trim);
            }
        }
        
        this.compileBody(panel);
        return panel;
    }

    private parseAttribute(char: string, line: string): IspfAttribute {
        const type = line.includes('TYPE(INPUT)') ? 'INPUT' : (line.includes('TYPE(OUTPUT)') ? 'OUTPUT' : 'TEXT');
        const color = line.match(/COLOR\((\w+)\)/)?.[1] as any || 'GREEN';
        const intens = line.includes('INTENS(HIGH)') ? 'HIGH' : 'LOW';
        const caps = line.includes('CAPS(ON)');
        return { char, type, color, intens, caps };
    }

    private compileBody(panel: IspfPanel) {
        // Transform raw text rows into Fields
        panel.fields = [];
        
        panel.bodyRows.forEach((rowStr, rIndex) => {
            let colIndex = 0;
            while (colIndex < rowStr.length) {
                const char = rowStr[colIndex];
                const attr = panel.attrs.get(char);

                if (attr) {
                    // Start of a field
                    let content = "";
                    let vName = "";
                    let len = 0;
                    
                    // Look ahead until next attr or end of line
                    let k = colIndex + 1;
                    while (k < rowStr.length && !panel.attrs.has(rowStr[k])) {
                        content += rowStr[k];
                        k++;
                    }
                    len = k - colIndex - 1; // Length of data content excluding attr char
                    
                    // Logic to detect variable name in Input/Output fields
                    // Convention for this sim: _VARNAME or #VARNAME
                    // Or if followed by spaces, it's just empty input
                    // We will check if 'content' looks like a variable name
                    if (attr.type !== 'TEXT') {
                         const match = content.match(/^([A-Z0-9#@$]+)(\s*)/); // Simple var regex
                         if (match) {
                             vName = match[1];
                             // For display, we usually blank out the variable name in input fields
                             // In output fields, we keep it as placeholder?
                             // Standard ISPF puts variable content.
                         }
                    }

                    panel.fields.push({
                        row: rIndex,
                        col: colIndex,
                        length: len < 0 ? 0 : len,
                        variable: vName || undefined,
                        attribute: attr,
                        value: content // Initial static value
                    });

                    colIndex = k;
                } else {
                    // Static text outside of defined fields? 
                    // Usually ISPF body starts with an attribute char. 
                    // If loose text, ignore or treat as text field? 
                    // We assume well-formed panel where everything is preceded by attr char.
                    colIndex++;
                }
            }
        });
    }

    // --- Execution ---

    public handleInput(buffer: ScreenChar[]) {
        // 1. Scrape buffer into variables
        const panel = this.getCurrentPanel();
        if (!panel) return;

        panel.fields.forEach(f => {
            if (f.attribute.type === 'INPUT') {
                // Read from buffer
                let val = "";
                // buffer index = f.row * 80 + f.col + 1 (skip attr byte)
                const startIdx = f.row * 80 + f.col + 1;
                for (let i = 0; i < f.length; i++) {
                    val += buffer[startIdx + i].char;
                }
                if (f.variable) {
                    this.variables[f.variable] = val.trim();
                }
                // Special case: ZCMD
                if (f.variable === 'ZCMD') {
                    // If ZCMD is not empty, we might need to process it
                }
            }
        });

        // 2. Execute PROC
        this.executeProc(panel);

        // 3. Render next state
        this.renderCurrentPanel();
    }

    private executeProc(panel: IspfPanel) {
        // Very basic script interpreter
        const zcmd = this.variables['ZCMD'] || '';
        
        // Handle Navigation (Simulated ZSEL)
        if (zcmd !== '') {
            // Check if user entered jump command (=X, =1)
            if (zcmd.startsWith('=')) {
                const jump = zcmd.substring(1);
                // Basic Jump: Only support =X (Exit)
                if (jump === 'X') {
                    this.panelStack = []; 
                }
            }
        }
    }

    public evalZSEL(): string | null {
        // Helper to resolve the ZSEL logic usually found in Primary Menu
        // Returns "PGM(NAME)" or "PANEL(NAME)" string
        const cmd = this.variables['ZCMD'];
        if (!cmd) return null;

        // Mock Logic based on Standard Panel
        if (cmd === '1') return 'PGM(STUDIO)'; 
        if (cmd === '2') return 'PGM(TOOLS)'; 
        if (cmd === '3') return 'PGM(UTILS)';
        if (cmd === 'X') return 'EXIT';
        
        return null;
    }

    public clearZCMD() {
        this.variables['ZCMD'] = '';
    }

    // --- Rendering ---

    public renderCurrentPanel() {
        const panel = this.getCurrentPanel();
        if (!panel) {
            this.clearScreen();
            this.writeString(10, 25, "ISPF TERMINATED. PRESS F3.");
            this.cursor = { row: 0, col: 0 };
            return;
        }

        this.clearScreen();
        
        // Render Fields
        panel.fields.forEach(f => {
            // Resolve content
            let content = f.value;
            if (f.variable) {
                // If variable exists in pool, use it
                if (this.variables[f.variable] !== undefined) {
                    content = this.variables[f.variable];
                }
            }
            
            // Format content to length
            content = content.padEnd(f.length, ' ').substring(0, f.length);

            // 1. Write Attribute Byte
            const attrIdx = f.row * 80 + f.col;
            this.screenBuffer[attrIdx] = { char: ' ', attr: this.mapAttr(f.attribute) };

            // 2. Write Content
            for (let i = 0; i < f.length; i++) {
                this.screenBuffer[attrIdx + 1 + i] = { 
                    char: content[i], 
                    attr: this.mapAttr(f.attribute) 
                };
            }
        });

        // Calculate Cursor Position
        // Priority: Field named 'ZCMD', otherwise first INPUT field.
        const zcmdField = panel.fields.find(f => f.variable === 'ZCMD');
        const firstInput = panel.fields.find(f => f.attribute.type === 'INPUT');
        const target = zcmdField || firstInput;
        
        if (target) {
            // +1 because the field starts at 'col' (attribute byte), input is next char
            this.cursor = { row: target.row, col: target.col + 1 };
        } else {
            this.cursor = { row: 0, col: 0 };
        }
        
        // Footer Message
        if (this.message) {
            this.writeString(23, 1, this.message, 1); // Bright
            this.message = ""; // Consume
        }
    }

    private clearScreen() {
        for (let i = 0; i < this.screenBuffer.length; i++) {
            this.screenBuffer[i] = { char: ' ', attr: 0 };
        }
    }

    private writeString(row: number, col: number, str: string, attr: number = 0) {
        let idx = (row * 80) + col;
        for (let i = 0; i < str.length; i++) {
            if (idx < this.screenBuffer.length) {
                this.screenBuffer[idx] = { char: str[i], attr };
                idx++;
            }
        }
    }

    private mapAttr(a: IspfAttribute): number {
        // Simple mapping: 0=Normal Green, 1=Bright White, 2=Input Red
        if (a.type === 'INPUT') return 2;
        if (a.intens === 'HIGH') return 1;
        return 0; // Low/Green
    }
}
