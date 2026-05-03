import React from "react";
import { X } from "lucide-react";
import "../../styles/components.css";

export default function Modal({ title, onClose, children, width = 700 }) {
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width }}>
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button className="modal__close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
