
export const SAMPLE_CODE = `000100 IDENTIFICATION DIVISION.
000200 PROGRAM-ID. HELLO-DUCK.
000300
000400 DATA DIVISION.
000500 WORKING-STORAGE SECTION.
000600 01 WS-NAME    PIC X(10) VALUE "STUDENT".
000700 01 WS-COUNT   PIC 9(2)  VALUE 1.
000800 01 WS-MSG     PIC X(25) VALUE "WELCOME TO DUCK SIM".
000900
001000 PROCEDURE DIVISION.
001100*    THIS IS A SAMPLE DUCK PROGRAM
001200     DISPLAY "STARTING DUCK MAINFRAME SIMULATION...".
001300
001400     DISPLAY "PLEASE ENTER YOUR NAME:".
001500     ACCEPT WS-NAME.
001600
001700     DISPLAY WS-MSG.
001800     DISPLAY "HELLO, " WS-NAME.
001900
002000     PERFORM UNTIL WS-COUNT > 3
002100        DISPLAY "PROCESSING JOB STEP: " WS-COUNT
002200        ADD 1 TO WS-COUNT
002300     END-PERFORM.
002400
002500     DISPLAY "JOB COMPLETED SUCCESSFULLY.".
002600     STOP RUN.`;

export const PANEL_ISR_PRIM = `)ATTR
  % TYPE(TEXT) INTENS(HIGH) COLOR(WHITE)
  + TYPE(TEXT) INTENS(LOW)  COLOR(GREEN)
  _ TYPE(INPUT) INTENS(HIGH) COLOR(RED) CAPS(ON)
)BODY
%----------------  DUCK Mainframe Simulator - ISPF Menu  --------------------
%OPTION  ===>_ZCMD                                                             +
%                                                           +USERID   - &ZUSER
%   1 +COBOL Studio    Edit, Compile and Run                +TIME     - &ZTIME
%   2 +Code Tools      Generators and explainers (Soon)     +DATE     - &ZDATE
%   3 +Utilities       Data tools (future)
%   X +Exit            Terminate DUCK Simulator
%
+Enter%END+command to terminate.
%
%   "Everything you need to learn mainframe concepts — without a mainframe."
%
)PROC
  &ZSEL = TRANS( TRUNC (&ZCMD,'.')
                1,'PGM(STUDIO)'
                2,'PGM(TOOLS)'
                3,'PGM(UTILS)'
                X,'EXIT'
                *,'?' )
)END`;

export const PANEL_ISPOPT = `)ATTR
  % TYPE(TEXT) INTENS(HIGH) COLOR(WHITE)
  + TYPE(TEXT) INTENS(LOW)  COLOR(GREEN)
  _ TYPE(INPUT) INTENS(HIGH) COLOR(RED) CAPS(ON)
)BODY
%-----------------------  DUCK SETTINGS  -----------------------------------
%COMMAND ===>_ZCMD                                                             +
%
%   Log/List ...
%
%   Function keys ...
%
+Press%F3+to Exit.
)PROC
)END`;
