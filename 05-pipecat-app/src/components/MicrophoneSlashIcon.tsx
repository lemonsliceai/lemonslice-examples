import React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  title?: string;
  titleId?: string;
}

const MicrophoneSlashIcon = React.forwardRef<SVGSVGElement, IconProps>(
  function MicrophoneSlashIcon({ title, titleId, ...props }, ref) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        aria-labelledby={titleId}
        {...props}
      >
        {title ? <title id={titleId}>{title}</title> : null}
        <path
          d="M3.33157 2.40868C3.66659 2.09013 4.19642 2.10349 4.51497 2.43851L17.0321 15.6032C17.3507 15.9382 17.3373 16.4681 17.0023 16.7866C16.6673 17.1051 16.1374 17.0918 15.8189 16.7568L3.30173 3.59208C2.98318 3.25705 2.99654 2.72722 3.33157 2.40868Z"
          fill="currentColor"
        />
        <path
          d="M4.6877 7.8125C5.20547 7.8125 5.6252 8.23223 5.6252 8.75C5.6252 11.1662 7.58395 13.125 10.0002 13.125C10.7088 13.125 11.3769 12.9543 11.9689 12.6553L13.301 14.0566C12.5948 14.4968 11.7951 14.8007 10.9377 14.9297V16.875H12.8127C13.3305 16.875 13.7502 17.2947 13.7502 17.8125C13.7502 18.3303 13.3305 18.75 12.8127 18.75H7.1877C6.66993 18.75 6.2502 18.3303 6.2502 17.8125C6.2502 17.2947 6.66993 16.875 7.1877 16.875H9.0627V14.9297C6.05569 14.4773 3.7502 11.8831 3.7502 8.75C3.7502 8.23223 4.16993 7.8125 4.6877 7.8125Z"
          fill="currentColor"
        />
        <path
          d="M15.3127 7.8125C15.8305 7.8125 16.2502 8.23223 16.2502 8.75C16.2502 9.94681 15.9127 11.0644 15.3293 12.0146L13.9709 10.5859C14.2295 10.0275 14.3752 9.4059 14.3752 8.75C14.3752 8.23223 14.7949 7.8125 15.3127 7.8125Z"
          fill="currentColor"
        />
        <path
          d="M10.5676 11.1826C10.3851 11.225 10.1956 11.25 10.0002 11.25C8.61949 11.25 7.5002 10.1307 7.5002 8.75V7.95508L10.5676 11.1826Z"
          fill="currentColor"
        />
        <path
          d="M10.0002 1.25C11.3809 1.25 12.5002 2.36929 12.5002 3.75V8.75C12.5002 8.8421 12.4943 8.93294 12.4846 9.02246L7.5002 3.78027V3.75C7.5002 2.36929 8.61949 1.25 10.0002 1.25Z"
          fill="currentColor"
        />
      </svg>
    );
  },
);

MicrophoneSlashIcon.displayName = "MicrophoneSlashIcon";
export default MicrophoneSlashIcon;
