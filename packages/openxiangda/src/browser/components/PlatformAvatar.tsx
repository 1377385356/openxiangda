import { Avatar } from 'antd';
import { useEffect, useState } from 'react';

export const PLATFORM_DEFAULT_AVATAR_URL = new URL(
  '../assets/default-avatar.png',
  import.meta.url,
).href;

export function PlatformAvatar({
  avatarUrl,
  size = 'small',
  className,
}: {
  avatarUrl?: string | null;
  size?: number | 'small' | 'default' | 'large';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatarUrl]);
  const src = avatarUrl && !failed ? avatarUrl : PLATFORM_DEFAULT_AVATAR_URL;
  return (
    <Avatar
      className={className}
      draggable={false}
      onError={() => {
        setFailed(true);
        return false;
      }}
      size={size}
      src={src}
    />
  );
}
