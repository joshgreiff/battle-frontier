"use client";

import { useEffect, useRef, useState } from "react";
import type { FormatOption } from "@/lib/formats";

type FormatSelectProps = {
  value: string;
  options: FormatOption[];
  onChange: (nextValue: string) => void;
  label?: string;
};

export default function FormatSelect({
  value,
  options,
  onChange,
  label = "Select format"
}: FormatSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.id === value);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="formatSelect" ref={containerRef}>
      <button
        type="button"
        className="formatSelectTrigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span>{selected?.label ?? label}</span>
        <span className="formatChevron">{open ? "˄" : "˅"}</span>
      </button>
      {open && (
        <ul className="formatMenu">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={value === option.id ? "formatOption active" : "formatOption"}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
