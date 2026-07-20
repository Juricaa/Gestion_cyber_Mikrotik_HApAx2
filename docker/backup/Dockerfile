FROM alpine:3.20

RUN apk add --no-cache mariadb-client zip gzip tzdata bash dos2unix
RUN --network=host apk add --no-cache mariadb-client zip gzip tzdata bash dos2unix

WORKDIR /backup

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

RUN sed -i '1s/^\xEF\xBB\xBF//' /usr/local/bin/backup.sh \
    && sed -i '1s/^\xEF\xBB\xBF//' /usr/local/bin/entrypoint.sh \
    && dos2unix /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh \
    && echo "0 23 * * * /bin/bash /usr/local/bin/backup.sh >> /backup/backup.log 2>&1" > /etc/crontabs/root

CMD ["/bin/bash", "/usr/local/bin/entrypoint.sh"]
 