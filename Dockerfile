FROM node:latest
MAINTAINER Hugo "ThePooN" Denizart <thepoon@cartooncraft.fr>

WORKDIR /usr/src/app
COPY . /usr/src/app

RUN npm install

EXPOSE 8069
CMD [ "node", "." ]
