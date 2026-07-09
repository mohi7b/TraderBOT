"use client";
import { create } from "zustand";

export const useDepthLayer0Store = create((set) => ({
  data: null,
  update: (d) => set({ data: d }),
}));
