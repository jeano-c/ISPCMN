export interface JwtUser {
  id: string;
  email: string;
}
export interface JwtPayload {
  email: string;
  sub: number;
}
