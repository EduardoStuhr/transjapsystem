import React from "react";
import "../../styles/components.css";

export default function Select({ label, value, onChange, options, style: ext = {} }) {
  return (
    <div className="field" style={ext}>
      {label && <label className="field__label">{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="field__select"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
