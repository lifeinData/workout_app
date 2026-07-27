import { useRef, useState } from 'react';
import { ImagePlus, X, Send } from 'lucide-react';
import { toast } from 'sonner';
import { BoardId, communityStore, ME } from '../../state/communityStore';

export function PostComposer({ board, placeholder }: { board: BoardId; placeholder: string }) {
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickImage = (file: File) => {
    setImageUrl(URL.createObjectURL(file));
  };

  const submit = () => {
    if (!text.trim() && !imageUrl) return;
    communityStore.addPost(board, text.trim(), imageUrl ?? undefined);
    setText('');
    setImageUrl(null);
    toast.success('Posted to the board');
  };

  return (
    <div className="bg-card rounded-3xl p-4 border border-border shadow-sm">
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground flex items-center justify-center text-sm flex-shrink-0">
          {ME.initials}
        </div>
        <div className="flex-1 min-w-0">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            rows={2}
            className="w-full bg-transparent outline-none resize-none text-card-foreground placeholder:text-muted-foreground"
          />

          {imageUrl && (
            <div className="relative mt-2 rounded-2xl overflow-hidden">
              <img src={imageUrl} alt="Attachment" className="w-full max-h-64 object-cover" />
              <button
                onClick={() => setImageUrl(null)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-foreground/60 text-background flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <ImagePlus className="w-4 h-4" />
              Photo
            </button>
            <input
              ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); }}
            />
            <button
              onClick={submit}
              disabled={!text.trim() && !imageUrl}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm shadow-md shadow-primary/30 disabled:opacity-40 disabled:shadow-none"
            >
              <Send className="w-3.5 h-3.5" />
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
