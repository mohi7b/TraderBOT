"use client";
import { create } from "zustand";

export const usePriceStore = create((set) => ({
  price: null,
  update: (p) => set({ price: p }),
}));
