# Code-Cola

run this code poweshell as admin 

Postgre
docker run -d --name postgres -e POSTGRES_USER=judifyadmin -e POSTGRES_PASSWORD=casejudify2026 -e POSTGRES_DB=casesdb -p 5433:5432 -v postgres_data:/var/lib/postgresql postgres

870d86d7a615570d293f2c44398026011a1c04561aa26d7c6eb0d3202923dab9


MinIO
docker run -d -p 9000:9000 -p 9001:9001 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin --name minio minio/minio server /data --console-address ":9001"


PS C:\WINDOWS\system32> docker ps
CONTAINER ID   IMAGE         COMMAND                  CREATED                  STATUS              PORTS                                                             NAMES
10d7e3222326   minio/minio   "/usr/bin/docker-ent…"   Less than a second ago   Up 4 seconds        0.0.0.0:9000-9001->9000-9001/tcp, [::]:9000-9001->9000-9001/tcp   minio
91e1b53f8b0a   postgres      "docker-entrypoint.s…"   About a minute ago       Up About a minute   0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp                       postgres


to run postgre inside the docker
docker exec -it postgres psql -U judifyadmin -d casesdb

install pg module in the backend folder -- > npm install pg
also install minio --> npm install minio
then go to scripts then run 
node createTables.js 

PS D:\Code-Cola\backend\scripts> node createTables.js
✅ PostgreSQL Connected
✅ PostgreSQL Tables Created Successfully
PS D:\Code-Cola\backend\scripts> 

docker exec -it postgres psql -U judifyadmin -d casesdb
\dt
                List of tables
 Schema |     Name      | Type  |    Owner
--------+---------------+-------+-------------
 public | audio_records | table | judifyadmin
 public | cases         | table | judifyadmin
 public | history       | table | judifyadmin
 public | notes         | table | judifyadmin
 public | summaries     | table | judifyadmin
 public | users         | table | judifyadmin
(6 rows)