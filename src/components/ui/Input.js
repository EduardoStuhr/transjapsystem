import React from "react";
import "../../styles/components.css";

export default function Input({
  label,
  value,
  onChange,
  type = "text",
  step,
  min,
  hint,
  placeholder,
  readOnly = false,
  disabled = false,
  style: ext = {},
  ...inputProps
}) {
  return (
    <div className="field" style={ext}>
      {label && <label className="field__label">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        step={step}
        min={min}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={disabled}
        className="field__input"
        {...inputProps}
      />
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}
