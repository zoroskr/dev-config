type User = {
  name: string;
  nickname?: string;
};

export function displayName(user: User) {
  return user.nickname ?? user.name;
}
