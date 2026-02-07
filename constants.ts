
export const SAMPLE_CODE = `000100 IDENTIFICATION DIVISION.
000200 PROGRAM-ID. HELLO-WORLD.
000300
000400 DATA DIVISION.
000500 WORKING-STORAGE SECTION.
000600 01 WS-NAME    PIC X(10) VALUE "USER".
000700 01 WS-COUNT   PIC 9(2)  VALUE 1.
000800 01 WS-MAX     PIC 9(2)  VALUE 5.
000900 01 WS-MSG     PIC X(20).
001000
001100 PROCEDURE DIVISION.
001200*    THIS IS A COMMENT LINE
001300     DISPLAY "STARTING MAINFRAME SIMULATION...".
001400
001500     DISPLAY "PLEASE ENTER YOUR NAME:".
001600     ACCEPT WS-NAME.
001700
001800     MOVE "HELLO " TO WS-MSG.
001900     DISPLAY WS-MSG WS-NAME.
002000
002100     DISPLAY "STARTING LOOP...".
002200
002300     PERFORM UNTIL WS-COUNT > WS-MAX
002400        DISPLAY "COUNTER: " WS-COUNT
002500        ADD 1 TO WS-COUNT
002600     END-PERFORM.
002700
002800     IF WS-COUNT > 5 THEN
002900        DISPLAY "LOOP FINISHED SUCCESSFULLY."
003000     ELSE
003100        DISPLAY "LOOP ENDED PREMATURELY."
003200     END-IF.
003300
003400     STOP RUN.`;

export const PANEL_ISR_PRIM = `)ATTR
  % TYPE(TEXT) INTENS(HIGH) COLOR(WHITE)
  + TYPE(TEXT) INTENS(LOW)  COLOR(GREEN)
  _ TYPE(INPUT) INTENS(HIGH) COLOR(RED) CAPS(ON)
)BODY
%-----------------------  ISPF PRIMARY OPTION MENU  ------------------------
%OPTION  ===>_ZCMD                                                             +
%                                                           +USERID   - &ZUSER
%   0 +Settings      Terminal and user parameters           +TIME     - &ZTIME
%   1 +View          Display source data or listings        +DATE     - &ZDATE
%   2 +Edit          Create or change source data
%   3 +Utilities     Perform utility functions
%   4 +Foreground    Interactive language processing
%   5 +Batch         Submit job for batch processing
%   6 +Command       Enter TSO or Workstation commands
%   7 +Dialog Test   Perform dialog testing
%   X +Exit          Terminate ISPF using log and list defaults
%
+Enter%END+command to terminate ISPF.
%
)PROC
  &ZSEL = TRANS( TRUNC (&ZCMD,'.')
                0,'PANEL(ISPOPT)'
                1,'PGM(VIEW)'
                2,'PGM(EDIT)'
                3,'PGM(UTIL)'
                4,'PGM(FORE)'
                5,'PGM(BATCH)'
                6,'PGM(TSO)'
                X,'EXIT'
                *,'?' )
)END`;

export const PANEL_ISPOPT = `)ATTR
  % TYPE(TEXT) INTENS(HIGH) COLOR(WHITE)
  + TYPE(TEXT) INTENS(LOW)  COLOR(GREEN)
  _ TYPE(INPUT) INTENS(HIGH) COLOR(RED) CAPS(ON)
)BODY
%-----------------------  ISPF SETTINGS  -----------------------------------
%COMMAND ===>_ZCMD                                                             +
%
%   Log/List ...
%
%   Function keys ...
%
+Press%F3+to Exit.
)PROC
)END`;
