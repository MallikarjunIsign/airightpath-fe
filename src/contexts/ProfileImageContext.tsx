import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { userService } from '@/services/user.service';

interface ProfileImageContextType {
  imageUrl: string | null;
  isLoading: boolean;
  refreshImage: () => Promise<void>;
}

const ProfileImageContext = createContext<ProfileImageContextType | undefined>(undefined);

export function ProfileImageProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const prevUrlRef = useRef<string | null>(null);

  const revokeUrl = useCallback(() => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
  }, []);

  const fetchImage = useCallback(async () => {
    if (!user?.email) {
      revokeUrl();
      setImageUrl(null);
      return;
    }

    setIsLoading(true);
    try {
      const res = await userService.getProfileImage(user.email);
      // BE returns 204 No Content when no image — axios may return empty blob
      if (res.data && res.data.size > 0 && res.status !== 204) {
        revokeUrl();
        const url = URL.createObjectURL(res.data);
        prevUrlRef.current = url;
        setImageUrl(url);
      } else {
        revokeUrl();
        setImageUrl(null);
      }
    } catch {
      // No profile image or error — show initials fallback
      revokeUrl();
      setImageUrl(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.email, revokeUrl]);

  // Fetch on login, clear on logout
  useEffect(() => {
    if (isAuthenticated && user?.email) {
      fetchImage();
    } else {
      revokeUrl();
      setImageUrl(null);
    }
  }, [isAuthenticated, user?.email, fetchImage, revokeUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => revokeUrl();
  }, [revokeUrl]);

  const refreshImage = useCallback(async () => {
    await fetchImage();
  }, [fetchImage]);

  return (
    <ProfileImageContext.Provider value={{ imageUrl, isLoading, refreshImage }}>
      {children}
    </ProfileImageContext.Provider>
  );
}

export function useProfileImage() {
  const context = useContext(ProfileImageContext);
  if (!context) {
    throw new Error('useProfileImage must be used within ProfileImageProvider');
  }
  return context;
}
