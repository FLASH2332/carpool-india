type DataResult<T> = {
  data: T | null;
  errors?: readonly { message: string }[];
};

/** Throw if a data client call returned GraphQL errors; otherwise return its data. */
export function unwrap<T>(result: DataResult<T>, action: string): T | null {
  if (result.errors?.length) {
    throw new Error(
      `${action} failed: ${result.errors.map((e) => e.message).join('; ')}`,
    );
  }
  return result.data;
}
