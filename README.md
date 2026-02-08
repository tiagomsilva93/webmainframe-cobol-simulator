# 🦆 DUCK Mainframe Simulator

DUCK is a web-based mainframe simulator focused on learning COBOL, ISPF, JCL, and CICS concepts interactively, right in your browser.

## What DUCK Is

*   **Learning-focused**: Designed for students and developers curious about mainframe technology without the steep setup curve.
*   **Visual**: Simulates the 3270 "Green Screen" experience, ISPF panels, and CICS maps.
*   **Runs in Browser**: No installation required. Everything runs client-side.
*   **No z/OS Required**: Simulates the behavior of the operating system APIs without needing actual mainframe hardware.

## What DUCK Is NOT

*   **Not a full emulator**: It does not emulate CPU instructions or hardware.
*   **Not z/OS**: It is a simulation of the *experience*, not the kernel.
*   **Not production-grade**: The COBOL compiler is strict but designed for educational feedback, not production workloads.

## Features (v0.1)

*   **COBOL Runtime**: Compiles and runs Enterprise COBOL-style syntax.
*   **ISPF Environment**: Simulates the Interactive System Productivity Facility menus and navigation.
*   **Editor**: A line-based editor simulating ISREDIT commands.
*   **CICS Support**: Basic support for Transaction Server commands (EXEC CICS SEND/RECEIVE MAP).
*   **VSAM Simulation**: Basic keyed file access simulation.

## Getting Started

1.  Open the application in your browser.
2.  Navigate the ISPF menus using standard options (e.g., `2` for Edit).
3.  Write your COBOL code in the editor.
4.  Press `F1` (or use the on-screen button) to Submit/Run.
5.  View output in the simulated Spool (SDSF/Sysout).

---
*Powered by WebMainframe Core*
