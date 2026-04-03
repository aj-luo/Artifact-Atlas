import styles from './List.module.css';
import Link from 'next/link';
import { useState, useEffect } from 'react'; 
import x_icon from '../assets/x-mark.png';

function List() {
    const [modal, setModal] = useState(false);

    const [sent, setSent] = useState(false);

    const toggleModal = () => {
        setModal(!modal);
    };

    // This is used to toggle whether the message has been sent or not
    const toggleText = () => { 
        setSent(!sent);
    };

    // 2. Handle side effects properly
    useEffect(() => {
        if (modal) {
            document.body.classList.add('active-modal');
        } else {
            document.body.classList.remove('active-modal');
        }
        // Cleanup function to remove class if component unmounts
        return () => document.body.classList.remove('active-modal');
    }, [modal]);
    
    return (
        <>
        <ul className={styles.list}>
          <li><Link href="/aa/tos" target='_blank' rel='noreferrer'>T.O.S.</Link></li>
            <li>|</li>
          <li><Link href="/aa/privacy" target='_blank' rel='noreferrer'>PRIVACY</Link></li>
            <li>|</li>
          <li><Link href="/aa/assets" target='_blank' rel='noreferrer'>ASSETS</Link></li>
            <li>|</li>
          <li><Link href="/aa/instructions" target='_blank' rel='noreferrer'>INSTRUCTIONS</Link></li>
            <li>|</li>
            <li onClick={toggleModal} style={{cursor: 'pointer'}}>CONTACT</li>
        </ul>


        {modal && (
        // 3. Changed class names to use the 'styles' object
        <div className={styles.modal}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h2>Contact Us</h2>
            <form className={styles.form} action="https://formspree.io/f/xaqdyelz" method="POST">
            <div className={styles.inputContainer}>
              <input type="text" placeholder="Name" name="name" className={styles.inputField} required/>
              <input type="email" placeholder="Email" name="email" className={styles.inputField} required/>
              <textarea className={`${styles.inputField} ${styles.messageField}`} placeholder="Message" name="message" required></textarea>
              </div>
              <button className={styles.closeModal} onClick={toggleModal}>
                <img className={styles.closeIcon}  src={x_icon.src} alt="Close" />
              </button>
              <button type="submit" className={styles.sendButton}>SEND</button>
            </form>
          </div>
        </div>
      )}
        </>
    );
}

export default List;