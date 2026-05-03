import React from "react";
import Sidebar from "./Sidebar";
import "../../styles/components.css";

export default function Layout({ page, setPage, quotations, children }) {
  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} quotations={quotations} />
      <main className="app-content">{children}</main>
    </div>
  );
}
