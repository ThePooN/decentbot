FROM node:latest
MAINTAINER Marcus Ramse <jerwuqu@gmail.com>

WORKDIR /usr/src/app
COPY . /usr/src/app

RUN npm install

CMD [ "node", "." ]
