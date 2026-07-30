"use client";

import { logout } from "./actions";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button className="btn sm ghost" type="submit">
        Sign out
      </button>
    </form>
  );
}
