FROM alpine:3.20

RUN apk add --no-cache mariadb-client gzip tzdata bash dos2unix

WORKDIR /backup

COPY backup.sh /usr/local/bin/backup.sh

RUN sed -i '1s/^\xEF\xBB\xBF//' /usr/local/bin/backup.sh \
    && dos2unix /usr/local/bin/backup.sh \
    && chmod +x /usr/local/bin/backup.sh \
    && echo "*/2 * * * * /bin/bash /usr/local/bin/backup.sh >> /backup/backup.log 2>&1" > /etc/crontabs/root
    # echo "0 23 * * * /bin/bash /usr/local/bin/backup.sh >> /backup/backup.log 2>&1" > /etc/crontabs/root

CMD ["crond", "-f", "-l", "8"]