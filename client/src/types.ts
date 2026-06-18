export type Role = "ADMIN" | "MEMBER";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt?: string;
}

export interface Member extends User {
  createdBy?: { id: string; name: string } | null;
}
