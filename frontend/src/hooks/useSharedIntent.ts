import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';

interface SharedData {
  type: 'image' | 'text' | 'files';
  content: string | string[] | null;
  extra?: {
    text?: string;
  };
}

export function useSharedIntent() {
  const [sharedData, setSharedData] = useState<SharedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const handleAppUrl = (event: { url: string }) => {
      console.log('App URL received:', event.url);
    };

    const subscription = App.addListener('appUrlOpen', handleAppUrl);
    
    checkForSharedIntent();

    return () => {
      subscription.then(sub => sub.remove());
    };
  }, []);

  const checkForSharedIntent = async () => {
    try {
      setIsProcessing(true);
      
      const result = await App.getLaunchUrl();
      
      if (result?.url) {
        const url = result.url;
        
        if (url.startsWith('http')) {
          setSharedData({
            type: 'text',
            content: url,
          });
        } else if (url.includes('?')) {
          const params = new URLSearchParams(url.split('?')[1]);
          const amount = params.get('amount');
          const desc = params.get('description');
          
          if (amount || desc) {
            setSharedData({
              type: 'text',
              content: `${amount || ''} ${desc || ''}`.trim(),
              extra: {
                text: params.toString(),
              },
            });
          }
        }
      }
    } catch (error) {
      console.log('No shared intent found');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearSharedData = () => {
    setSharedData(null);
  };

  return { sharedData, isProcessing, clearSharedData };
}
