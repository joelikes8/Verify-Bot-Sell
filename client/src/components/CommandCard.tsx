interface CommandCardProps {
  name: string;
  description: string;
  usage: string;
  category: "Verification" | "Admin" | "Utility";
}

export default function CommandCard({ name, description, usage, category }: CommandCardProps) {
  // Category styling
  const getCategoryStyle = () => {
    switch (category) {
      case "Verification":
        return "bg-blue-500 bg-opacity-20 text-blue-300";
      case "Admin":
        return "bg-purple-500 bg-opacity-20 text-purple-300";
      case "Utility":
        return "bg-green-500 bg-opacity-20 text-green-300";
      default:
        return "bg-gray-500 bg-opacity-20 text-gray-300";
    }
  };

  return (
    <div className="border border-gray-700 rounded-lg p-4 mb-4 hover:bg-discord-darker transition duration-200">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-md">{name}</h3>
          <p className="text-gray-400 text-sm mt-1">{description}</p>
        </div>
        <span className={`py-1 px-2 rounded-md text-xs font-medium ${getCategoryStyle()}`}>
          {category}
        </span>
      </div>
      <div className="mt-4">
        <h4 className="text-xs uppercase text-gray-500 font-medium mb-2">Usage</h4>
        <code className="bg-discord-darker text-sm p-2 rounded block">{usage}</code>
      </div>
    </div>
  );
}
