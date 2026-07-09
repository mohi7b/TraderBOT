"use client";
import { create } from "zustand";

export const useVolumeStore = create((set) => ({
  volume: null,
  update: (v) => set({ volume: v }),
}));
