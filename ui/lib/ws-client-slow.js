"use client";

export async function fetchSlow() {
  try {
    const res = await fetch("http://5.255.121.157:9003/api/slow");
    return await res.json();
  } catch (err) {
    console.log("⚠️ slow fetch error", err);
    return null;
  }
}
