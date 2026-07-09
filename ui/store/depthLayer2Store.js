"use client";
import { create } from "zustand";

export const useDepthLayer2Store = create((set) => ({
  data: null,
  update: (d) => set({ data: d }),
}));
