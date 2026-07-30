"use client";

import { signOut } from "../join/actions";

export function SignOutButton() {
  return (
    <form action={signOut} style={{ display: "inline" }}>
      <button
        type="submit"
        className="navbtn"
        title="Sign out on this device"
      >
        Sign out
      </button>
    </form>
  );
}
