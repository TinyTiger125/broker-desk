/*
 * Local temporary-password API probe.
 *
 * The single stdin frame carries conninfo, role, and password as length-prefixed
 * bytes. Nothing sensitive is accepted in argv or environment and no raw
 * libpq error text is printed. This is not a production Keychain writer.
 */
#include <arpa/inet.h>
#include <libpq-fe.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_FRAME_BYTES 32768U

static void wipe(void *buffer, size_t length) {
  if (!buffer) return;
  volatile unsigned char *p = (volatile unsigned char *)buffer;
  while (length--) *p++ = 0;
}

static int read_stdin_frame(unsigned char **out, size_t *length) {
  size_t capacity = 4096;
  size_t used = 0;
  unsigned char *buffer = malloc(capacity);
  if (!buffer) return 0;
  for (;;) {
    if (used == capacity) {
      if (capacity >= MAX_FRAME_BYTES) {
        wipe(buffer, used);
        free(buffer);
        return 0;
      }
      size_t next = capacity * 2;
      unsigned char *grown = realloc(buffer, next);
      if (!grown) {
        wipe(buffer, used);
        free(buffer);
        return 0;
      }
      buffer = grown;
      capacity = next;
    }
    size_t count = fread(buffer + used, 1, capacity - used, stdin);
    used += count;
    if (count == 0) {
      if (ferror(stdin) || used == 0) {
        wipe(buffer, used);
        free(buffer);
        return 0;
      }
      break;
    }
  }
  *out = buffer;
  *length = used;
  return 1;
}

static int read_field(const unsigned char *frame, size_t frame_length, size_t *offset, char **out) {
  if (*offset + sizeof(uint32_t) > frame_length) return 0;
  uint32_t encoded_length = 0;
  memcpy(&encoded_length, frame + *offset, sizeof(encoded_length));
  *offset += sizeof(encoded_length);
  uint32_t field_length = ntohl(encoded_length);
  if (field_length == 0 || field_length > MAX_FRAME_BYTES || *offset + field_length > frame_length) return 0;
  char *field = calloc((size_t)field_length + 1, 1);
  if (!field) return 0;
  memcpy(field, frame + *offset, field_length);
  *offset += field_length;
  *out = field;
  return 1;
}

static const char *result_sqlstate(const PGresult *result) {
  const char *state = PQresultErrorField(result, PG_DIAG_SQLSTATE);
  return state && *state ? state : "unknown";
}

static int allowed_role(const char *role) {
  return strcmp(role, "brokerdesk_runtime") == 0 || strcmp(role, "brokerdesk_admin") == 0;
}

int main(int argc, char **argv) {
  if (argc != 1) {
    fputs("invalid_invocation\n", stderr);
    return 64;
  }

  unsigned char *frame = NULL;
  size_t frame_length = 0;
  char *conninfo = NULL;
  char *role = NULL;
  char *password = NULL;
  PGconn *connection = NULL;
  PGresult *result = NULL;
  int exit_code = 0;

  if (!read_stdin_frame(&frame, &frame_length)) {
    fputs("invalid_input:sqlstate=unknown\n", stderr);
    return 65;
  }
  size_t offset = 0;
  if (!read_field(frame, frame_length, &offset, &conninfo)
      || !read_field(frame, frame_length, &offset, &role)
      || !read_field(frame, frame_length, &offset, &password)
      || offset != frame_length) {
    fputs("invalid_input:sqlstate=unknown\n", stderr);
    exit_code = 65;
    goto cleanup;
  }
  if (!allowed_role(role)) {
    fputs("role_not_allowed:sqlstate=unknown\n", stderr);
    exit_code = 68;
    goto cleanup;
  }

  connection = PQconnectdb(conninfo);
  if (PQstatus(connection) != CONNECTION_OK) {
    fputs("connect_failed:sqlstate=unknown\n", stderr);
    exit_code = 66;
    goto cleanup;
  }

  result = PQchangePassword(connection, role, password);
  if (PQresultStatus(result) != PGRES_COMMAND_OK) {
    fprintf(stderr, "password_change_failed:sqlstate=%s\n", result_sqlstate(result));
    exit_code = 67;
    goto cleanup;
  }

  fputs("password_change_ok\n", stdout);

cleanup:
  if (result) PQclear(result);
  if (connection) PQfinish(connection);
  wipe(password, password ? strlen(password) : 0);
  wipe(role, role ? strlen(role) : 0);
  wipe(conninfo, conninfo ? strlen(conninfo) : 0);
  free(password);
  free(role);
  free(conninfo);
  wipe(frame, frame_length);
  free(frame);
  return exit_code;
}
