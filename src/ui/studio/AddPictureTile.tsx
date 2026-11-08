import "./addPictureTile.css";

export function AddPictureTile({ onClick, label = "Add pictures" }: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button type="button" className="add-picture-tile" aria-label={label} title={label} onClick={onClick}>
      <span aria-hidden="true">+</span>
    </button>
  );
}
