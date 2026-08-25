import React, { useState } from "react";
import emailjs from "@emailjs/browser";

// Fill these in from your EmailJS dashboard (Step 2 below).
const EMAILJS_SERVICE_ID = "service_fdgl9uj";
const EMAILJS_TEMPLATE_ID = "template_vwvyhcg";
const EMAILJS_PUBLIC_KEY = "3ovtZ3SUhLXKu7WXC";

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        { from_name: form.name, from_email: form.email, message: form.message },
        { publicKey: EMAILJS_PUBLIC_KEY }
      );
      setStatus("sent");
      setForm({ name: "", email: "", message: "" });
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: "#0B0F14" }}>
      <div className="w-full max-w-md mx-auto rounded-xl border p-6" style={{ background: "#0F1720", borderColor: "#1E2A35" }}>
        <h1 className="text-xl font-bold mb-1" style={{ color: "#EAEDF2" }}>Contact me</h1>
        <p className="text-sm mb-5" style={{ color: "#7B8894" }}>Found a bug, or have a suggestion for a new lab? Send it over.</p>

        {status === "sent" ? (
          <div className="rounded-md p-4 text-sm text-center" style={{ background: "#111722", color: "#5EEAD4" }}>
            Thanks — your message has been sent!
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#7B8894" }}>Name</label>
            <input
              required value={form.name} onChange={update("name")}
              className="w-full rounded-md px-3 py-2 text-sm mb-3 border outline-none"
              style={{ background: "#111722", borderColor: "#25303E", color: "#EAEDF2" }}
            />
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#7B8894" }}>Your email</label>
            <input
              type="email" required value={form.email} onChange={update("email")}
              className="w-full rounded-md px-3 py-2 text-sm mb-3 border outline-none"
              style={{ background: "#111722", borderColor: "#25303E", color: "#EAEDF2" }}
            />
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#7B8894" }}>Message</label>
            <textarea
              required value={form.message} onChange={update("message")} rows={5}
              className="w-full rounded-md px-3 py-2 text-sm mb-4 border outline-none resize-none"
              style={{ background: "#111722", borderColor: "#25303E", color: "#EAEDF2" }}
            />

            {status === "error" && (
              <p className="text-xs mb-3" style={{ color: "#F87171" }}>
                Something went wrong sending your message — please try again.
              </p>
            )}

            <button
              type="submit" disabled={status === "sending"}
              className="w-full rounded-md py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{ background: "#5EEAD4", color: "#0B0F14" }}
            >
              {status === "sending" ? "Sending…" : "Send message"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}