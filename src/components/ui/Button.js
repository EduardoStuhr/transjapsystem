import React from "react";
import "../../styles/components.css";

export default function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  style: ext = {},
  type = "button",
}) {
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`btn btn--${size} btn--${variant}`}
      style={ext}
    >
      {children}
    </button>
  );
}
