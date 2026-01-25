import React, { useEffect, useRef, useState } from 'react';

interface InputModalProps {
  isOpen: boolean;
  variableName: string;
  picType: string;
  picLength: number;
  onSubmit: (value: string) => void;
}

export const InputModal: React.FC<InputModalProps> = ({ 
  isOpen, 
  variableName, 
  picType, 
  picLength, 
  onSubmit 
}) => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(""); // Reset value on open
      // Small delay to ensure render before focus
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };

  const displayPic = `PIC ${picType}(${picLength})`;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-white text-black border-4 border-black p-6 w-[500px] shadow-[8px_8px_0px_0px_rgba(255,255,255,0.2)] font-mono">
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="text-lg font-bold">
            ENTER WITH VALUE {variableName}...:
          </div>
          
          <input
            ref={inputRef}
            type="text"
            className="border-b-2 border-black bg-transparent outline-none text-xl font-bold uppercase w-full pb-1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={picLength} // Enforce COBOL length limit
          />

          <div className="text-sm font-bold mt-2">
            * {variableName} {displayPic}
          </div>

          <div className="text-xs text-right mt-4 opacity-50">
            PRESS ENTER TO CONTINUE
          </div>
        </form>

      </div>
    </div>
  );
};