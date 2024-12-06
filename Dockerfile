FROM node:20.9.0-alpine AS builder

USER node

RUN mkdir -p /home/node/app

WORKDIR /home/node/app

COPY --chown=node . .
RUN yarn install --frozen-lockfile && yarn build

FROM node:20.9.0-alpine

USER node

WORKDIR /home/node/app

COPY --from=builder --chown=node /home/node/app/node_modules ./node_modules
COPY --from=builder --chown=node /home/node/app/dist ./dist
COPY --from=builder --chown=node /home/node/app/package.json .

CMD [ "yarn", "start" ]