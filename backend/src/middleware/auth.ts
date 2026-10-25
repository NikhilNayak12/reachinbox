import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export function signToken(uid: string) {
  return jwt.sign({ uid }, env.jwtSecret, { expiresIn: '7d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const p = jwt.verify(req.cookies?.token ?? '', env.jwtSecret) as { uid: string };
    res.locals.userId = p.uid;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}
