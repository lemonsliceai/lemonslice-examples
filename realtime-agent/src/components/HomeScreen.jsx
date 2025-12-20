import React from "react";
import { Loader2 } from "lucide-react";

export default function HomeScreen({ createCall, creatingRoom }) {
  const startDemo = () => {
    createCall();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center px-4 pt-16 text-center">
      <h1 className="text-grey-light mb-4 text-4xl font-bold">
        Lemon Slice Agent Demo
      </h1>
      <p className="text-grey-light mb-8 max-w-md text-lg">
        Connect to the Lemon Slice agent by clicking the button below.
      </p>
      <button
        onClick={startDemo}
        type="button"
        disabled={creatingRoom}
        className={`bg-turquoise hover:bg-turquoise-hover text-darkest-blue focus:ring-turquoise 
          focus:ring-offset-darkest-blue flex cursor-pointer items-center gap-2 rounded-lg 
          px-6 py-3 text-sm font-semibold shadow-md transition-colors duration-200 focus:outline-none 
          focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70`}
      >
        {creatingRoom ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Joining room...</span>
          </>
        ) : (
          "Talk to Agent"
        )}
      </button>
    </div>
  );
}
