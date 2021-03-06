import got from 'got';
import express from 'express';
import sha256 from 'sha256';
import NodeCache from 'node-cache';
import { Request } from 'express';
import { secretType } from 'express-jwt';

export class ASAPPubKeyFetcher {
    private baseUrl: string;
    private ttl: number;
    private cache: NodeCache;

    constructor(baseUrl: string, ttl: number) {
        this.baseUrl = baseUrl;
        this.cache = new NodeCache({ stdTTL: ttl });
        this.pubKeyCallback = this.pubKeyCallback.bind(this);
    }

    /* eslint-disable */
    pubKeyCallback(req: Request, header: any, payload: any, done: (err: any, secret?: secretType) => void): void {
        /* eslint-enable */
        if (!header.kid) {
            done(new Error('kid is required in header'), null);
            return;
        }

        const pubKey: string = this.cache.get(header.kid);

        if (pubKey) {
            req.context.logger.debug('using pub key from cache');
            done(null, pubKey);
            return;
        }

        req.context.logger.debug('fetching pub key from key server');
        fetchPublicKey(this.baseUrl, header.kid)
            .then((pubKey) => {
                this.cache.set(header.kid, pubKey);
                done(null, pubKey);
                return;
            })
            .catch((err) => {
                req.context.logger.error(`obtaining asap pub ${err}`);
                done(err);
                return;
            });
    }
}

async function fetchPublicKey(baseUrl: string, kid: string): Promise<string> {
    const hashedKid = sha256(kid);
    const reqUrl = `${baseUrl}/${hashedKid}.pem`;
    const response = await got(reqUrl);
    return response.body;
}

export function unauthErrMiddleware(
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
): void {
    if (err.name === 'UnauthorizedError') {
        req.context.logger.info(`unauthorized token ${err}`);
        res.status(401).send('invalid token...');
    }
    next();
}
