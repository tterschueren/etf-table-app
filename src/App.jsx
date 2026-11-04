import React, { useEffect, useRef } from "react";
import { render, H } from "./render.js";
import { BLOCKS, CURRENCIES, INDICATORS, ECB_RATE } from "./data.js";

export default function App() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const resize = () => {
      const w = cv.clientWidth || 300;
      const dpr = window.devicePixelRatio || 1;
      cv.width = w * dpr;
      cv.height = H * dpr;
      cv.style.height = H + "px";
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, w, BLOCKS, CURRENCIES, INDICATORS, ECB_RATE);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return (
    <div style={{ width: "100%", maxWidth: 300, margin: "0 auto", background: "#000" }}>
      <canvas ref={ref} style={{ width: "100%", display: "block" }} />
    </div>
  );
}
